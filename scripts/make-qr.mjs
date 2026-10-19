// 產生聯絡信箱的 QR code（內嵌 SVG，離線可用，不需要任何外部服務）。
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
const mail = 'civicinquiry.undone480@passinbox.com';
const qr = QRCode.create(`mailto:${mail}`, { errorCorrectionLevel: 'M' });
const n = qr.modules.size, d = qr.modules.data;
let path = '';
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
writeFileSync('src/data/contact.ts', `// 由 scripts/make-qr.mjs 產生，請勿手改\nexport const CONTACT_EMAIL = '${mail}';\nexport const QR_SIZE = ${n};\nexport const QR_PATH = '${path}';\n`);
console.log('modules', n);
