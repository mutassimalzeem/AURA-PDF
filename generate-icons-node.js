// Generate proper PNG icons using pure Node.js (no dependencies)
const fs = require('fs');
const zlib = require('zlib');

function createPNGIcon(size) {
  // Create RGBA pixel data
  const pixels = Buffer.alloc(size * size * 4);
  
  // Color constants (RGBA)
  const colors = {
    blue: [122, 162, 247, 255],    // #7aa2f7
    purple: [187, 154, 247, 255],  // #bb9af7
    white: [255, 255, 255, 255],
    transparent: [0, 0, 0, 0]
  };
  
  const scale = size / 128;
  const radius = Math.round(size * 0.1875);
  
  // Helper to set pixel
  function setPixel(x, y, color) {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }
  
  // Helper to check if point is inside rounded rect
  function isInRoundedRect(x, y, rx, ry, width, height, radius) {
    // Check if inside rectangle bounds
    if (x < rx || x > rx + width || y < ry || y > ry + height) {
      return false;
    }
    
    // Check corners
    const cornerRadius = radius;
    
    // Top-left corner
    if (x < rx + radius && y < ry + radius) {
      const dx = x - (rx + radius);
      const dy = y - (ry + radius);
      return (dx * dx + dy * dy) <= radius * radius;
    }
    
    // Top-right corner
    if (x > rx + width - radius && y < ry + radius) {
      const dx = x - (rx + width - radius);
      const dy = y - (ry + radius);
      return (dx * dx + dy * dy) <= radius * radius;
    }
    
    // Bottom-left corner
    if (x < rx + radius && y > ry + height - radius) {
      const dx = x - (rx + radius);
      const dy = y - (ry + height - radius);
      return (dx * dx + dy * dy) <= radius * radius;
    }
    
    // Bottom-right corner
    if (x > rx + width - radius && y > ry + height - radius) {
      const dx = x - (rx + width - radius);
      const dy = y - (ry + height - radius);
      return (dx * dx + dy * dy) <= radius * radius;
    }
    
    return true;
  }
  
  // Draw background gradient
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Gradient from blue to purple (diagonal)
      const t = (x + y) / (size * 2);
      const r = Math.round(colors.blue[0] + (colors.purple[0] - colors.blue[0]) * t);
      const g = Math.round(colors.blue[1] + (colors.purple[1] - colors.blue[1]) * t);
      const b = Math.round(colors.blue[2] + (colors.purple[2] - colors.blue[2]) * t);
      
      // Apply rounded rectangle clipping
      const margin = 8 * scale;
      if (isInRoundedRect(x, y, margin, margin, size - 2 * margin, size - 2 * margin, radius)) {
        setPixel(x, y, [r, g, b, 255]);
      } else {
        setPixel(x, y, colors.transparent);
      }
    }
  }
  
  // Draw PDF icon in white (simplified document with arrow)
  const docX = Math.round(32 * scale);
  const docY = Math.round(24 * scale);
  const docWidth = Math.round(64 * scale);
  const docHeight = Math.round(80 * scale);
  const lineWidth = Math.max(2, Math.round(3 * scale));
  
  function drawLine(x1, y1, x2, y2, color) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const steps = Math.max(dx, dy);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      
      // Draw line thickness
      for (let ly = -Math.floor(lineWidth / 2); ly <= Math.floor(lineWidth / 2); ly++) {
        for (let lx = -Math.floor(lineWidth / 2); lx <= Math.floor(lineWidth / 2); lx++) {
          setPixel(x + lx, y + ly, color);
        }
      }
    }
  }
  
  // Document outline
  const foldSize = Math.round(16 * scale);
  
  // Draw document shape
  drawLine(docX, docY, docX + docWidth - foldSize, docY, colors.white);
  drawLine(docX + docWidth - foldSize, docY, docX + docWidth, docY + foldSize, colors.white);
  drawLine(docX + docWidth, docY + foldSize, docX + docWidth, docY + docHeight, colors.white);
  drawLine(docX + docWidth, docY + docHeight, docX, docY + docHeight, colors.white);
  drawLine(docX, docY + docHeight, docX, docY, colors.white);
  
  // Fold
  drawLine(docX + docWidth - foldSize, docY, docX + docWidth - foldSize, docY + foldSize, colors.white);
  drawLine(docX + docWidth - foldSize, docY + foldSize, docX + docWidth, docY + foldSize, colors.white);
  
  // Download arrow
  const centerX = docX + Math.round(docWidth / 2);
  const arrowTop = docY + Math.round(docHeight * 0.45);
  const arrowBottom = docY + Math.round(docHeight * 0.75);
  
  drawLine(centerX, arrowTop, centerX, arrowBottom, colors.white);
  
  // Arrow head
  const arrowHeadSize = Math.round(12 * scale);
  drawLine(centerX - arrowHeadSize, arrowBottom - arrowHeadSize, centerX, arrowBottom, colors.white);
  drawLine(centerX, arrowBottom, centerX + arrowHeadSize, arrowBottom - arrowHeadSize, colors.white);
  
  // Create PNG
  return createPNGFromPixels(pixels, size, size);
}

function createPNGFromPixels(pixels, width, height) {
  // Create IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // Create IDAT chunk (compressed image data)
  const rawData = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width + 1)] = 0; // filter byte (none)
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (width + 1) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];     // R
      rawData[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixels[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }
  
  const compressedData = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressedData);
  
  // Create IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // Combine all parts
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  
  // Calculate CRC
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = calculateCRC(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCRC(data) {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  
  return crc ^ 0xFFFFFFFF;
}

// CRC32 lookup table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

// Generate icons
const sizes = [16, 48, 128];
sizes.forEach(size => {
  console.log(`Generating ${size}x${size} icon...`);
  const png = createPNGIcon(size);
  fs.writeFileSync(`icon${size}.png`, png);
  console.log(`✓ Created icon${size}.png`);
});

console.log('\nAll icons generated successfully!');
