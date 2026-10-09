import { BarcodeFormat, BinaryBitmap, ChecksumException, DecodeHintType, FormatException, HybridBinarizer, MultiFormatReader, NotFoundException, RGBLuminanceSource } from '@zxing/library';

export function createImageDecoder() {
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  return (image: ImageData): string | null => {
    const luminance = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < luminance.length; i++) {
      const offset = i * 4;
      luminance[i] = (image.data[offset] + image.data[offset + 1] * 2 + image.data[offset + 2]) / 4;
    }
    try {
      return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, image.width, image.height))), hints).getText();
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return null;
      throw error;
    } finally { reader.reset(); }
  };
}

export function createZxingDecoder() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo preparar el escáner. Introduzca el código manualmente.');
  const decode = createImageDecoder();
  return async (video: HTMLVideoElement): Promise<string | null> => {
    if (!video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return decode(context.getImageData(0, 0, canvas.width, canvas.height));
  };
}
