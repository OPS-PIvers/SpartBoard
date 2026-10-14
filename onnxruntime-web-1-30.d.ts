// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- the package's types.d.ts is ambient-only, so it cannot be imported.
/// <reference path="./node_modules/onnxruntime-web-1-30/types.d.ts" />
// The aliased package ships ambient types under its real name only.
declare module 'onnxruntime-web-1-30' {
  export * from 'onnxruntime-web';
}
