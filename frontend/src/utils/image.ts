/**
 * Prepara una foto de perfil en el teléfono: recorte cuadrado centrado, 256×256 y JPEG.
 * Al volver a dibujarla en un lienzo se pierden los datos EXIF (ubicación, modelo de cámara): nunca salen del teléfono.
 */
export async function photoToAvatar(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La foto pesa demasiado. Elige otra.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No pudimos abrir esa imagen.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('No pudimos abrir esa imagen.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tu teléfono no pudo preparar la foto.');
    ctx.fillStyle = '#ffffff'; // fondo para PNG con transparencia
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
