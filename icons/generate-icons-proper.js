// Generate proper PNG icons with actual image data
const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#7aa2f7');
  gradient.addColorStop(1, '#bb9af7');
  
  // Draw rounded rectangle background
  const radius = size * 0.1875; // 24px for 128px
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  
  // Draw PDF document icon (white)
  const scale = size / 128;
  const lineWidth = Math.max(3, Math.floor(4 * scale));
  
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Document outline
  const docX = 32 * scale;
  const docY = 24 * scale;
  const docWidth = 64 * scale;
  const docHeight = 80 * scale;
  const foldSize = 16 * scale;
  
  ctx.beginPath();
  ctx.moveTo(docX, docY);
  ctx.lineTo(docX + docWidth - foldSize, docY);
  ctx.lineTo(docX + docWidth, docY + foldSize);
  ctx.lineTo(docX + docWidth, docY + docHeight);
  ctx.lineTo(docX, docY + docHeight);
  ctx.closePath();
  ctx.stroke();
  
  // Fold lines
  ctx.beginPath();
  ctx.moveTo(docX + docWidth - foldSize, docY);
  ctx.lineTo(docX + docWidth - foldSize, docY + foldSize);
  ctx.lineTo(docX + docWidth, docY + foldSize);
  ctx.stroke();
  
  // Download arrow
  const centerX = docX + docWidth / 2;
  const arrowTop = docY + docHeight * 0.45;
  const arrowBottom = docY + docHeight * 0.75;
  
  ctx.beginPath();
  ctx.moveTo(centerX, arrowTop);
  ctx.lineTo(centerX, arrowBottom);
  ctx.stroke();
  
  // Arrow head
  const arrowHeadSize = 12 * scale;
  ctx.beginPath();
  ctx.moveTo(centerX - arrowHeadSize, arrowBottom - arrowHeadSize);
  ctx.lineTo(centerX, arrowBottom);
  ctx.lineTo(centerX + arrowHeadSize, arrowBottom - arrowHeadSize);
  ctx.stroke();
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`✓ Created icon${size}.png (${size}x${size})`);
});

console.log('\nAll icons generated successfully!');
