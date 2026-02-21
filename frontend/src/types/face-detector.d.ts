interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}

interface FaceDetector {
  detect(source: CanvasImageSource): Promise<DetectedFace[]>;
}

declare const FaceDetector: {
  prototype: FaceDetector;
  new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): FaceDetector;
};
