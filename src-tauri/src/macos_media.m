#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>

int32_t moya_mic_auth_status(void) {
  return (int32_t)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}

int32_t moya_speech_auth_status(void) {
  return (int32_t)[SFSpeechRecognizer authorizationStatus];
}

void moya_request_mic_access(void (*cb)(int32_t granted, void *ctx), void *ctx) {
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
                           completionHandler:^(BOOL granted) {
                             cb(granted ? 1 : 0, ctx);
                           }];
}

void moya_request_speech_access(void (*cb)(int32_t status, void *ctx), void *ctx) {
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    cb((int32_t)status, ctx);
  }];
}
