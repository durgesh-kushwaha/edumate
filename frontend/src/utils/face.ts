import type { FaceProfile } from '../types';

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceMatchResult = {
  student_id: string | null;
  student_name: string;
  enrollment_number: string;
  distance: number;
  descriptor: number[];
  box: FaceBox;
};

const DESCRIPTOR_WIDTH = 16;
const DESCRIPTOR_HEIGHT = 8;

export function isFaceDetectorSupported() {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

export async function detectFacesInVideo(video: HTMLVideoElement, maxFaces = 10): Promise<FaceBox[]> {
  if (!isFaceDetectorSupported()) {
    throw new Error('Camera face detection is not supported in this browser. Please use Chrome or Edge.');
  }

  const Detector = (window as unknown as { FaceDetector: typeof FaceDetector }).FaceDetector;
  const detector = new Detector({
    fastMode: true,
    maxDetectedFaces: maxFaces,
  });
  const faces = await detector.detect(video);
  return faces.map((face) => ({
    x: face.boundingBox.x,
    y: face.boundingBox.y,
    width: face.boundingBox.width,
    height: face.boundingBox.height,
  }));
}

export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to read camera frame');
  }
  ctx.drawImage(video, 0, 0, width, height);
  return frameCanvas;
}

export function boxToBlob(frameCanvas: HTMLCanvasElement, box: FaceBox): Promise<Blob> {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.floor(box.width));
  cropCanvas.height = Math.max(1, Math.floor(box.height));

  const ctx = cropCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to crop image');
  }

  ctx.drawImage(
    frameCanvas,
    Math.max(0, box.x),
    Math.max(0, box.y),
    Math.max(1, box.width),
    Math.max(1, box.height),
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  return new Promise((resolve, reject) => {
    cropCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create image blob'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
}

function descriptorFromBox(frameCanvas: HTMLCanvasElement, box: FaceBox): number[] {
  const descriptorCanvas = document.createElement('canvas');
  descriptorCanvas.width = DESCRIPTOR_WIDTH;
  descriptorCanvas.height = DESCRIPTOR_HEIGHT;
  const ctx = descriptorCanvas.getContext('2d');
  if (!ctx) {
    return [];
  }

  ctx.drawImage(
    frameCanvas,
    Math.max(0, box.x),
    Math.max(0, box.y),
    Math.max(1, box.width),
    Math.max(1, box.height),
    0,
    0,
    DESCRIPTOR_WIDTH,
    DESCRIPTOR_HEIGHT,
  );

  const image = ctx.getImageData(0, 0, DESCRIPTOR_WIDTH, DESCRIPTOR_HEIGHT).data;
  const vector: number[] = [];
  for (let index = 0; index < image.length; index += 4) {
    const r = image[index] ?? 0;
    const g = image[index + 1] ?? 0;
    const b = image[index + 2] ?? 0;
    vector.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
  }

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

export function euclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    return 999;
  }
  let sum = 0;
  for (let i = 0; i < v1.length; i += 1) {
    const delta = (v1[i] ?? 0) - (v2[i] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

export function matchFacesFromFrame(
  frameCanvas: HTMLCanvasElement,
  faceBoxes: FaceBox[],
  profiles: FaceProfile[],
  tolerance: number,
): FaceMatchResult[] {
  return faceBoxes.map((box) => {
    const descriptor = descriptorFromBox(frameCanvas, box);
    let best: FaceProfile | null = null;
    let bestDistance = 999;

    for (const profile of profiles) {
      const distance = euclideanDistance(descriptor, profile.encoding);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = profile;
      }
    }

    if (!best || bestDistance > tolerance) {
      return {
        student_id: null,
        student_name: 'Unknown',
        enrollment_number: '',
        distance: bestDistance,
        descriptor,
        box,
      };
    }

    return {
      student_id: best.student_id,
      student_name: best.student_name,
      enrollment_number: best.enrollment_number,
      distance: bestDistance,
      descriptor,
      box,
    };
  });
}
