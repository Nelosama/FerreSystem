import { UpceReader } from './upceReader';
import { BarcodeFormat, BinaryBitmap, BitArray, ChecksumException, DecodeHintType, FormatException, HybridBinarizer, MultiFormatReader, NotFoundException, RGBLuminanceSource } from '@zxing/library';

export function createImageDecoder() {
  const reader = new MultiFormatReader();
  const upce = new UpceReader();
  let middleRow = new BitArray();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  return (image: ImageData): string | null => {
    const luminance = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < luminance.length; i++) {
      const offset = i * 4;
      luminance[i] = (image.data[offset] + image.data[offset + 1] * 2 + image.data[offset + 2]) / 4;
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, image.width, image.height)));
    try {
      // A centered UPC-E should not wait for a full-frame failed EAN/Code 128 scan.
      // Keep the full-frame fallback for off-center/reversed labels.
      try {
        const middle = Math.floor(image.height / 2);
        middleRow = bitmap.getBlackRow(middle, middleRow);
        return upce.decodeRow(middle, middleRow).getText();
      }
      catch (error) {
        if (!(error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException)) throw error;
      }
      try { return reader.decodeWithState(bitmap).getText(); }
      catch (error) {
        if (!(error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException)) throw error;
        return upce.decode(bitmap, hints).getText();
      }
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return null;
      throw error;
    } finally { reader.reset(); upce.reset(); }
  };
}

export function createZxingDecoder() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo preparar el escáner. Introduzca el código manualmente.');
  const decode = createImageDecoder();
  return async (video: HTMLVideoElement): Promise<string | null> => {
    if (!video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
    // Resizing resets the canvas and reallocates its bitmap, so only do it on change.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return decode(context.getImageData(0, 0, canvas.width, canvas.height));
  };
}
