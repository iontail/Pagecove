#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <signal.h>

#ifndef HOST_BUNDLE_ID
#define HOST_BUNDLE_ID @"io.github.iontail.paperglim"
#endif

static void emit(NSString *phase, NSDictionary *fields) {
    NSMutableDictionary *value = [fields mutableCopy] ?: [NSMutableDictionary dictionary];
    value[@"phase"] = phase;
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout);
}

@interface Driver : NSObject <SPUUserDriver, SPUUpdaterDelegate>
@property(nonatomic, strong) SPUUpdater *updater;
@property(nonatomic, copy) void (^install)(SPUUserUpdateChoice);
@property(nonatomic, copy) void (^cancel)(void);
@property(nonatomic) uint64_t expected;
@property(nonatomic) uint64_t received;
@property(nonatomic) NSInteger percent;
@property(nonatomic) BOOL finished;
@property(nonatomic) BOOL probing;
@property(nonatomic) BOOL found;
@property(nonatomic) BOOL installing;
@property(nonatomic, strong) NSBundle *host;
@property(nonatomic) BOOL cancelling;
@property(nonatomic, strong) NSMutableString *input;
@end

@implementation Driver
- (void)fail:(NSError *)error {
    if (self.finished) return;
    if ([error.domain isEqualToString:SUSparkleErrorDomain] && error.code == SUNoUpdateError) { emit(@"current", nil); exit(0); }
    self.finished = YES;
    emit(@"error", @{@"code": @(error.code), @"domain": error.domain ?: @"Sparkle"});
    if (self.installing) {
        NSAlert *alert = [NSAlert new];
        alert.messageText = @"Pagecove 업데이트를 마치지 못했어";
        alert.informativeText = @"저장된 자료는 유지했어. 앱을 다시 열고 설정에서 업데이트를 다시 확인해 줘.";
        [alert addButtonWithTitle:@"앱 다시 열기"]; [alert addButtonWithTitle:@"닫기"];
        [NSApp activateIgnoringOtherApps:YES];
        if ([alert runModal] == NSAlertFirstButtonReturn) {
            [NSWorkspace.sharedWorkspace openApplicationAtURL:self.host.bundleURL configuration:[NSWorkspaceOpenConfiguration configuration] completionHandler:nil];
        }
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ exit(1); });
}
- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request reply:(void (^)(SUUpdatePermissionResponse *))reply {
    reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:NO sendSystemProfile:NO]);
}
- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {
    self.cancel = cancellation; emit(@"checking", nil);
}
- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:(void (^)(SPUUserUpdateChoice))reply {
    if (item.informationOnlyUpdate || ![item.installationType isEqualToString:@"application"]) {
        reply(SPUUserUpdateChoiceDismiss);
        [self fail:[NSError errorWithDomain:@"PaperGlimUpdater" code:1 userInfo:nil]];
        return;
    }
    emit(@"found", @{@"version": item.displayVersionString, @"build": item.versionString});
    if (state.stage == SPUUserUpdateStageInstalling) {
        self.install = reply; emit(@"ready", nil);
    } else reply(SPUUserUpdateChoiceInstall);
}
- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)data {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}
- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    self.finished = YES; emit(@"current", nil); acknowledgement();
    dispatch_async(dispatch_get_main_queue(), ^{ exit(0); });
}
- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    [self fail:error]; acknowledgement();
}
- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
    self.cancel = cancellation; self.received = 0; self.expected = 0; self.percent = -1;
    emit(@"downloading", nil);
}
- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length { self.expected = length; }
- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {
    self.received += length;
    NSInteger percent = self.expected ? MIN(100, self.received * 100 / self.expected) : -1;
    if (percent != self.percent) {
        self.percent = percent;
        emit(@"downloading", @{@"percent": @(percent), @"received": @(self.received), @"total": @(self.expected)});
    }
}
- (void)showDownloadDidStartExtractingUpdate { self.cancel = nil; emit(@"verifying", nil); }
- (void)showExtractionReceivedProgress:(double)progress {}
- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))handler {
    if (self.cancelling) { handler(SPUUserUpdateChoiceSkip); return; }
    self.install = handler; emit(@"ready", nil);
}
- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)terminated retryTerminatingApplication:(void (^)(void))retry {
    self.installing = YES; emit(@"installing", nil);
}
- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledgement {
    self.finished = YES; emit(@"installed", @{@"relaunched": @(relaunched)}); acknowledgement();
    dispatch_async(dispatch_get_main_queue(), ^{ exit(0); });
}
- (void)dismissUpdateInstallation {}
- (BOOL)updaterShouldPromptForPermissionToCheckForUpdates:(SPUUpdater *)updater { return NO; }
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error { [self fail:error]; }
- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item {
    self.found = YES;
    if (self.probing) emit(@"available", @{@"version": item.displayVersionString, @"build": item.versionString});
}
- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)check error:(NSError *)error {
    if (self.cancelling) { dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), dispatch_get_main_queue(), ^{ exit(0); }); return; }
    // Allow the failed installer's XPC cleanup to finish before the next check.
    if (error) { [self fail:error]; dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), dispatch_get_main_queue(), ^{ exit(1); }); }
    else if (self.probing) { if (!self.found) emit(@"current", nil); exit(0); }
}
- (BOOL)updater:(SPUUpdater *)updater willInstallUpdateOnQuit:(SUAppcastItem *)item immediateInstallationBlock:(void (^)(void))handler {
    return NO;
}
- (void)command:(NSString *)command {
    if ([command isEqualToString:@"install"] && self.install) {
        void (^handler)(SPUUserUpdateChoice) = self.install; self.install = nil;
        self.installing = YES; handler(SPUUserUpdateChoiceInstall);
        dispatch_async(dispatch_get_main_queue(), ^{ emit(@"installing", nil); });
    } else if ([command isEqualToString:@"cancel"]) {
        if (self.cancelling || self.finished) return;
        self.cancelling = YES; emit(@"cancelled", nil);
        if (self.install) { void (^handler)(SPUUserUpdateChoice) = self.install; self.install = nil; handler(SPUUserUpdateChoiceSkip); }
        else if (self.cancel) { void (^cancel)(void) = self.cancel; self.cancel = nil; cancel(); }
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ exit(0); });
    }
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        signal(SIGPIPE, SIG_IGN);
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        NSURL *hostURL = NSBundle.mainBundle.bundleURL.URLByDeletingLastPathComponent.URLByDeletingLastPathComponent.URLByDeletingLastPathComponent;
        NSBundle *host = [NSBundle bundleWithURL:hostURL];
        if (![host.bundleIdentifier isEqualToString:HOST_BUNDLE_ID]) { emit(@"error", @{@"code": @2}); return 1; }
        Driver *driver = [Driver new];
        driver.host = host;
        // Sparkle relaunches without shell environment overrides.
        if (getenv("PAPERGLIM_PROFILE_DIR") && strlen(getenv("PAPERGLIM_PROFILE_DIR"))) { emit(@"error", @{@"code": @3}); return 1; }
        driver.probing = argc == 2 && strcmp(argv[1], "--probe") == 0;
        driver.input = [NSMutableString string];
        driver.updater = [[SPUUpdater alloc] initWithHostBundle:host applicationBundle:host userDriver:driver delegate:driver];
        driver.updater.userAgentString = [NSString stringWithFormat:@"Pagecove/%@", [host objectForInfoDictionaryKey:@"CFBundleShortVersionString"]];
        NSError *error = nil;
        if (![driver.updater startUpdater:&error]) { [driver fail:error]; return 1; }
        NSFileHandle.fileHandleWithStandardInput.readabilityHandler = ^(NSFileHandle *handle) {
            NSData *data = handle.availableData;
            if (!data.length) {
                handle.readabilityHandler = nil;
                dispatch_async(dispatch_get_main_queue(), ^{ if (!driver.installing) [driver command:@"cancel"]; });
                return;
            }
            NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            dispatch_async(dispatch_get_main_queue(), ^{
                if (!text || driver.input.length + text.length > 128) { [driver command:@"cancel"]; return; }
                [driver.input appendString:text];
                NSRange end;
                while ((end = [driver.input rangeOfString:@"\n"]).location != NSNotFound) {
                    NSString *command = [driver.input substringToIndex:end.location];
                    [driver.input deleteCharactersInRange:NSMakeRange(0, end.location + 1)];
                    [driver command:command];
                }
            });
        };
        if (driver.probing) [driver.updater checkForUpdateInformation];
        else [driver.updater checkForUpdates];
        [NSApp run];
    }
    return 0;
}
