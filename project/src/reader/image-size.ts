// Read dimensions before asking the browser to decode a potentially huge image.
// A small compressed PNG/WebP can otherwise allocate hundreds of megabytes.
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const data = new Uint8Array(await blob.slice(0, 512 * 1024).arrayBuffer());
  const view = new DataView(data.buffer);
  const ascii = (p: number, n: number) => new TextDecoder().decode(data.slice(p, p + n));
  let width = 0,
    height = 0;
  if (data.length >= 24 && data[0] === 137 && ascii(1, 3) === 'PNG') {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (data.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    for (let p = 12; p + 8 < data.length;) {
      const chunk = ascii(p, 4),
        size = view.getUint32(p + 4, true),
        start = p + 8;
      if (chunk === 'VP8X' && start + 10 <= data.length) {
        width = 1 + data[start + 4] + (data[start + 5] << 8) + (data[start + 6] << 16);
        height = 1 + data[start + 7] + (data[start + 8] << 8) + (data[start + 9] << 16);
        break;
      }
      if (chunk === 'VP8L' && start + 5 <= data.length && data[start] === 47) {
        const bits = view.getUint32(start + 1, true);
        width = 1 + (bits & 16383);
        height = 1 + ((bits >>> 14) & 16383);
        break;
      }
      if (chunk === 'VP8 ' && start + 10 <= data.length) {
        width = view.getUint16(start + 6, true) & 16383;
        height = view.getUint16(start + 8, true) & 16383;
        break;
      }
      p = start + size + (size % 2);
    }
  } else if (data[0] === 255 && data[1] === 216) {
    let p = 2;
    while (p + 8 < data.length) {
      if (data[p++] !== 255) continue;
      let marker = data[p++];
      while (marker === 255) marker = data[p++];
      if (
        marker === 216 ||
        marker === 217 ||
        marker === 0 ||
        marker === 1 ||
        (marker >= 208 && marker <= 215)
      )
        continue;
      const length = view.getUint16(p);
      if (length < 2) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = view.getUint16(p + 3);
        width = view.getUint16(p + 5);
        break;
      }
      p += length;
    }
  }
  if (!width || !height)
    throw Error('Не удалось прочитать размеры изображения. Поддерживаются JPG, PNG и WebP.');
  if (width * height > 32_000_000 || width > 24000 || height > 24000)
    throw Error(
      'Страница слишком большая для iPhone (до 32 мегапикселей). Уменьшите разрешение изображения.',
    );
  return { width, height };
}
