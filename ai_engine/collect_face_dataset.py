import os
import cv2

OUTPUT_DIR = os.getenv('DATASET_DIR', 'dataset')
STUDENT_ID = os.getenv('STUDENT_ID', 'unknown')


def main():
    os.makedirs(os.path.join(OUTPUT_DIR, STUDENT_ID), exist_ok=True)
    cap = cv2.VideoCapture(0)
    count = 0
    while count < 20:
        ret, frame = cap.read()
        if not ret:
            continue
        cv2.imshow('Capture Face - press c to capture', frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('c'):
            path = os.path.join(OUTPUT_DIR, STUDENT_ID, f'{count}.jpg')
            cv2.imwrite(path, frame)
            count += 1
        if key == ord('q'):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
