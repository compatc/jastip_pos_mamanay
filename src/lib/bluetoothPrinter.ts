// Print receipt via Web Bluetooth API (ESC/POS thermal printer 76mm)
// Putian POS80-01 uses KT6368A BLE chip
// Confirmed service/characteristic from nRF Connect scan

import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const ESC = "\x1B";
const GS = "\x1D";

// ESC/POS commands
const COMMANDS = {
  init: ESC + "@",
  center: ESC + "a" + "\x01",
  left: ESC + "a" + "\x00",
  right: ESC + "a" + "\x02",
  bold: ESC + "E" + "\x01",
  boldOff: ESC + "E" + "\x00",
  underline: ESC + "-" + "\x01",
  underlineOff: ESC + "-" + "\x00",
  feedLine: "\n",
  feedLines: (n: number) => ESC + "d" + String.fromCharCode(n),
  cut: GS + "V" + "\x01",
  // Font sizes
  normal: GS + "!" + "\x00",
  doubleWidth: GS + "!" + "\x20",
  doubleHeight: GS + "!" + "\x10",
  doubleBoth: GS + "!" + "\x30",
};

interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
}

function encodeText(text: string): Uint8Array {
  // Use TextEncoder for UTF-8, but ESC/POS typically uses CP437 or CP850
  // For Indonesian characters, we'll use a simple approach
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

function buildReceiptLines(lines: ReceiptLine[]): string {
  let output = COMMANDS.init;

  for (const line of lines) {
    // Set alignment
    switch (line.align) {
      case "center":
        output += COMMANDS.center;
        break;
      case "right":
        output += COMMANDS.right;
        break;
      default:
        output += COMMANDS.left;
    }

    // Set font style
    if (line.doubleWidth || line.doubleHeight) {
      if (line.doubleWidth && line.doubleHeight) {
        output += COMMANDS.doubleBoth;
      } else if (line.doubleWidth) {
        output += COMMANDS.doubleWidth;
      } else {
        output += COMMANDS.doubleHeight;
      }
    } else {
      output += COMMANDS.normal;
    }

    if (line.bold) {
      output += COMMANDS.bold;
    }

    output += line.text + COMMANDS.feedLine;

    if (line.bold) {
      output += COMMANDS.boldOff;
    }
  }

  // Feed and cut
  output += COMMANDS.feedLines(3);
  output += COMMANDS.cut;

  return output;
}

export async function printReceipt(receiptData: {
  storeName: string;
  storeAddress?: string;
  orderId: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  paid: number;
  change: number;
  paymentMethod: string;
  notes?: string;
  shopeePcs?: number;
  shopeeLink?: string;
}): Promise<boolean> {
  // Check if Web Bluetooth is supported
  if (!navigator.bluetooth) {
    alert("Browser tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.");
    return false;
  }

  try {
    // Request Bluetooth device - Putian POS80-01 (KT6368A chip)
    // From nRF Connect scan, the printer has these services:
    // 1. KT6368A: 49535343-fe7d-4ae5-8fa9-9fafd205e455
    // 2. SPP-like: 0000ffe0-0000-1000-8000-00805f9b34fb
    // 3. Other: 0000ff00, 0000fee7, 00001bf0
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: "POS" },
        { namePrefix: "RPP" },  // RPP02N from nRF scan
        { namePrefix: "BT" },
        { namePrefix: "Thermal" },
        { namePrefix: "Printer" },
        { namePrefix: "Putian" },
      ],
      optionalServices: [
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // KT6368A
        '0000ffe0-0000-1000-8000-00805f9b34fb', // SPP-like
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '00001bf0-0000-1000-8000-00805f9b34fb',
      ],
    });

    console.log("Connecting to:", device.name);

    // Connect to GATT server
    const server = await device.gatt?.connect();
    if (!server) {
      alert("Gagal koneksi ke printer");
      return false;
    }

    // Try known service/characteristic pairs for Putian POS80-01 (KT6368A)
    // Priority order based on nRF Connect scan
    const SERVICE_CHARS: { service: string; writeChar: string }[] = [
      {
        service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', // KT6368A primary
        writeChar: '49535343-8841-43f4-a8d4-ecbe34729bb3', // WRITE NO RESPONSE
      },
      {
        service: '0000ffe0-0000-1000-8000-00805f9b34fb',
        writeChar: '0000ffe1-0000-1000-8000-00805f9b34fb',
      },
      {
        service: '0000ff00-0000-1000-8000-00805f9b34fb',
        writeChar: '0000ff02-0000-1000-8000-00805f9b34fb',
      },
      {
        service: '0000fee7-0000-1000-8000-00805f9b34fb',
        writeChar: '0000fec7-0000-1000-8000-00805f9b34fb',
      },
      {
        service: '00001bf0-0000-1000-8000-00805f9b34fb',
        writeChar: '00002af1-0000-1000-8000-00805f9b34fb',
      },
    ];

    let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
    let matchedService = '';

    for (const { service, writeChar } of SERVICE_CHARS) {
      try {
        console.log(`Trying service: ${service.substring(0, 8)}...`);
        const svc = await server.getPrimaryService(service);
        writeCharacteristic = await svc.getCharacteristic(writeChar);
        matchedService = service;
        console.log(`✅ Connected to service: ${service}`);
        console.log(`   Write characteristic: ${writeChar}`);
        break;
      } catch {
        // Service or characteristic not found, try next
      }
    }

    // Fallback: scan all services if known pairs didn't work
    if (!writeCharacteristic) {
      console.log("Known pairs failed, scanning all services...");
      const services = await server.getPrimaryServices();
      
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeCharacteristic = char;
              matchedService = service.uuid;
              console.log(`✅ Found fallback service: ${service.uuid}`);
              break;
            }
          }
          if (writeCharacteristic) break;
        } catch {
          continue;
        }
      }
    }

    if (!writeCharacteristic) {
      alert("Tidak ditemukan characteristic yang bisa ditulis.");
      return false;
    }

    // Build receipt
    const receiptLines: ReceiptLine[] = [
      { text: receiptData.storeName, align: "center", bold: true, doubleWidth: true },
    ];

    if (receiptData.storeAddress) {
      receiptLines.push({ text: receiptData.storeAddress, align: "center" });
    }

    receiptLines.push({ text: "==============================", align: "center" });
    receiptLines.push({ text: `Order: ${receiptData.orderId}`, bold: true });
    receiptLines.push({ text: `Tanggal: ${receiptData.date}` });
    receiptLines.push({ text: "------------------------------" });

    for (const item of receiptData.items) {
      const itemTotal = item.qty * item.price;
      receiptLines.push({
        text: `${item.name}`,
        bold: false,
      });
      receiptLines.push({
        text: `  ${item.qty} x Rp${item.price.toLocaleString("id-ID")} = Rp${itemTotal.toLocaleString("id-ID")}`,
      });
    }

    receiptLines.push({ text: "------------------------------" });
    receiptLines.push({ text: `TOTAL: Rp${receiptData.total.toLocaleString("id-ID")}`, bold: true, doubleWidth: true });
    receiptLines.push({ text: `Bayar: Rp${receiptData.paid.toLocaleString("id-ID")}` });
    receiptLines.push({ text: `Kembali: Rp${receiptData.change.toLocaleString("id-ID")}` });
    receiptLines.push({ text: "------------------------------" });
    receiptLines.push({ text: `Pembayaran: ${receiptData.paymentMethod}` });

    if (receiptData.notes) {
      receiptLines.push({ text: `Catatan: ${receiptData.notes}` });
    }

    if (receiptData.shopeePcs && receiptData.shopeeLink) {
      receiptLines.push({ text: "------------------------------" });
      receiptLines.push({ text: `Checkout Shopee: ${receiptData.shopeePcs} pcs`, bold: true });
      receiptLines.push({ text: receiptData.shopeeLink, align: "center" });
    }

    receiptLines.push({ text: "------------------------------" });
    receiptLines.push({ text: "Terima kasih!", align: "center", bold: true });
    receiptLines.push({ text: receiptData.storeName, align: "center" });

    const receipt = buildReceiptLines(receiptLines);
    const data = encodeText(receipt);

    // BLE has limited MTU, use smaller chunks for reliability
    // Putian POS80-01 with KT6368A typically has MTU of 20-512 bytes
    const CHUNK_SIZE = 20; // Safe default for BLE
    let totalSent = 0;
    
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await writeCharacteristic.writeValueWithoutResponse(chunk);
      totalSent += chunk.length;
      
      // Update progress
      const progress = Math.round((totalSent / data.length) * 100);
      console.log(`Sending: ${progress}% (${totalSent}/${data.length} bytes)`);
      
      // Delay between chunks to prevent buffer overflow
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    console.log("✅ Receipt printed successfully!");
    return true;
  } catch (error) {
    console.error("Print error:", error);
    if ((error as Error).name === "NotFoundError") {
      console.log("User cancelled device selection");
    } else {
      alert("Gagal mencetak: " + (error as Error).message);
    }
    return false;
  }
}

// Helper function to generate receipt data from order
export function generateReceiptFromOrder(order: any, items: any[], products: any[]) {
  const orderItems = items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const shopeePcs = product?.shopee_pcs || 1;
    return {
      name: item.product_name,
      qty: item.quantity,
      price: item.price,
      shopeePcs,
    };
  });

  const totalPcs = orderItems.reduce((sum, item) => {
    return sum + (item.qty * shopeePcs) / 1000;
  }, 0);

  return {
    storeName: "Jastip_mamanay",
    orderId: order.id.slice(0, 8).toUpperCase(),
    date: new Date(order.created_at).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    items: orderItems.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
    total: order.total,
    paid: order.paid_total || 0,
    change: (order.paid_total || 0) - order.total,
    paymentMethod: order.payment_type === "tf" ? "Transfer Bank" : order.payment_type === "qris" ? "QRIS" : "Tunai",
    notes: order.notes || undefined,
    shopeePcs: totalPcs > 0 ? totalPcs : undefined,
    shopeeLink: totalPcs > 0 ? "https://s.shopee.co.id/8pjZ07JBJe" : undefined,
  };
}

// ========== IMAGE PRINTING ==========

// Convert image to ESC/POS raster format (GS v 0)
// Thermal printer 76mm = 576 dots wide
const PRINTER_WIDTH = 576;

export interface PrintOptions {
  rotation?: number;    // 0, 90, 180, 270
  sharpness?: number;   // 0-255, default 190 (threshold for black/white)
}

function imageDataToEscPos(imageData: ImageData, sharpness: number = 190): Uint8Array {
  const { width, height, data } = imageData;
  const commands: number[] = [];
  
  // Initialize
  commands.push(0x1B, 0x40); // ESC @
  
  // Use GS v 0 command for bit image
  const bytesPerRow = Math.ceil(width / 8);
  
  // GS v 0 command header
  commands.push(0x1D, 0x76, 0x30, 0x00);
  
  // xL, xH (width in bytes)
  commands.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
  
  // yL, yH (height in dots)
  commands.push(height & 0xFF, (height >> 8) & 0xFF);
  
  // Image data (1-bit per pixel, MSB first)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pixelIndex = (y * width + (x + bit)) * 4;
        if (pixelIndex < data.length) {
          // Use sharpness threshold for black/white conversion
          if (data[pixelIndex] < sharpness) {
            byte |= (1 << (7 - bit));
          }
        }
      }
      commands.push(byte);
    }
  }
  
  // Feed lines after image
  commands.push(0x1B, 0x64, 0x02); // Feed 2 lines (faster)
  
  // Cut paper
  commands.push(0x1D, 0x56, 0x01);
  
  return new Uint8Array(commands);
}

export async function printImage(
  imageFile: File,
  onProgress?: (progress: string) => void
): Promise<boolean> {
  if (!navigator.bluetooth) {
    alert("Browser tidak mendukung Web Bluetooth.");
    return false;
  }

  try {
    onProgress?.("Memuat gambar...");
    
    // Load image to canvas
    const img = new Image();
    const imageUrl = URL.createObjectURL(imageFile);
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    // Create canvas and draw image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Scale to fit printer width (576 dots)
    const scale = PRINTER_WIDTH / img.width;
    canvas.width = PRINTER_WIDTH;
    canvas.height = Math.floor(img.height * scale);
    
    // Fill white background
    ctx!.fillStyle = 'white';
    ctx!.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw image
    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(imageUrl);
    
    // Get image data
    const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
    
    // Convert to ESC/POS
    onProgress?.("Konversi gambar...");
    const escPosData = imageDataToEscPos(imageData);
    
    console.log(`Image size: ${canvas.width}x${canvas.height}, ESC/POS bytes: ${escPosData.length}`);
    
    // Request Bluetooth device
    onProgress?.("Mencari printer...");
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: "POS" },
        { namePrefix: "RPP" },
        { namePrefix: "BT" },
        { namePrefix: "Thermal" },
        { namePrefix: "Printer" },
      ],
      optionalServices: [
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '00001bf0-0000-1000-8000-00805f9b34fb',
      ],
    });

    onProgress?.("Menghubungkan...");
    const server = await device.gatt?.connect();
    if (!server) throw new Error("Gagal koneksi ke printer");

    // Try known service/characteristic pairs
    const SERVICE_CHARS: { service: string; writeChar: string }[] = [
      { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', writeChar: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
      { service: '0000ffe0-0000-1000-8000-00805f9b34fb', writeChar: '0000ffe1-0000-1000-8000-00805f9b34fb' },
      { service: '0000ff00-0000-1000-8000-00805f9b34fb', writeChar: '0000ff02-0000-1000-8000-00805f9b34fb' },
    ];

    let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

    for (const { service, writeChar } of SERVICE_CHARS) {
      try {
        const svc = await server.getPrimaryService(service);
        writeCharacteristic = await svc.getCharacteristic(writeChar);
        break;
      } catch {}
    }

    if (!writeCharacteristic) {
      throw new Error("Tidak ditemukan characteristic yang bisa ditulis");
    }

    // Send image data in chunks
    onProgress?.("Mencetak...");
    const CHUNK_SIZE = 20;
    
    for (let i = 0; i < escPosData.length; i += CHUNK_SIZE) {
      const chunk = escPosData.slice(i, i + CHUNK_SIZE);
      await writeCharacteristic.writeValueWithoutResponse(chunk);
      
      const progress = Math.round(((i + chunk.length) / escPosData.length) * 100);
      onProgress?.(`Mencetak: ${progress}%`);
      
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    console.log("✅ Image printed successfully!");
    return true;
  } catch (error) {
    console.error("Print image error:", error);
    if ((error as Error).name === "NotFoundError") {
      console.log("User cancelled device selection");
    } else {
      alert("Gagal mencetak: " + (error as Error).message);
    }
    return false;
  }
}

// ========== PDF DIRECT PRINTING ==========

async function getBluetoothWriter(onProgress?: (progress: string) => void): Promise<BluetoothRemoteGATTCharacteristic> {
  if (!navigator.bluetooth) {
    throw new Error("Browser tidak mendukung Web Bluetooth");
  }

  onProgress?.("Mencari printer...");
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: "POS" },
      { namePrefix: "RPP" },
      { namePrefix: "BT" },
      { namePrefix: "Thermal" },
      { namePrefix: "Printer" },
    ],
    optionalServices: [
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '00001bf0-0000-1000-8000-00805f9b34fb',
    ],
  });

  onProgress?.("Menghubungkan...");
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Gagal koneksi ke printer");

  const SERVICE_CHARS: { service: string; writeChar: string }[] = [
    { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', writeChar: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb', writeChar: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { service: '0000ff00-0000-1000-8000-00805f9b34fb', writeChar: '0000ff02-0000-1000-8000-00805f9b34fb' },
  ];

  for (const { service, writeChar } of SERVICE_CHARS) {
    try {
      const svc = await server.getPrimaryService(service);
      return await svc.getCharacteristic(writeChar);
    } catch {}
  }

  throw new Error("Tidak ditemukan characteristic yang bisa ditulis");
}

async function sendEscPosData(
  writer: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  onProgress?: (progress: string) => void
): Promise<void> {
  // Use larger chunks for faster printing (BLE MTU usually 20-512 bytes)
  const CHUNK_SIZE = 128;
  
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await writer.writeValueWithoutResponse(chunk);
    
    const progress = Math.round(((i + chunk.length) / data.length) * 100);
    onProgress?.(`Mencetak: ${progress}%`);
    
    // Minimal delay - just enough for printer to process
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

export async function printPdfDirect(
  pdfFile: File,
  onProgress?: (progress: string) => void,
  options: PrintOptions = {}
): Promise<boolean> {
  const { rotation = 90, sharpness = 190 } = options;
  
  try {
    onProgress?.("Memuat PDF...");
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    // Get Bluetooth writer
    const writer = await getBluetoothWriter(onProgress);
    
    // Process each page
    const totalPages = pdf.numPages;
    onProgress?.(`Memproses ${totalPages} halaman...`);
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.(`Halaman ${pageNum}/${totalPages}...`);
      
      const page = await pdf.getPage(pageNum);
      
      // Scale to fit printer width (576 dots)
      const viewport = page.getViewport({ scale: 1 });
      const scale = PRINTER_WIDTH / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      
      // Render to canvas
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d')!;
      
      // Apply rotation
      if (rotation === 90 || rotation === 270) {
        canvas.width = scaledViewport.height;
        canvas.height = scaledViewport.width;
      }
      
      // Fill white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Apply rotation transform
      ctx.save();
      if (rotation === 90) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (rotation === 180) {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
      } else if (rotation === 270) {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }
      
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;
      
      ctx.restore();
      
      // Get image data and convert to ESC/POS
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const escPosData = imageDataToEscPos(imageData, sharpness);
      
      console.log(`Page ${pageNum}: ${canvas.width}x${canvas.height}, ${escPosData.length} bytes`);
      
      // Send to printer
      await sendEscPosData(writer, escPosData, onProgress);
      
      // Add page break between pages (feed lines)
      if (pageNum < totalPages) {
        const pageBreak = new Uint8Array([0x1B, 0x64, 0x03]); // Feed 3 lines
        await writer.writeValueWithoutResponse(pageBreak);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log("✅ PDF printed successfully!");
    return true;
  } catch (error) {
    console.error("Print PDF error:", error);
    if ((error as Error).name === "NotFoundError") {
      console.log("User cancelled device selection");
    } else {
      alert("Gagal mencetak: " + (error as Error).message);
    }
    return false;
  }
}

// ========== BATCH PDF PRINTING ==========

export async function printPdfBatch(
  pdfFiles: File[],
  onProgress?: (progress: string) => void,
  options: PrintOptions = {}
): Promise<{ success: number; failed: number }> {
  const { rotation = 90, sharpness = 190 } = options;
  let success = 0;
  let failed = 0;
  
  if (pdfFiles.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  try {
    // Get Bluetooth writer once for all files
    const writer = await getBluetoothWriter(onProgress);
    
    for (let i = 0; i < pdfFiles.length; i++) {
      const pdfFile = pdfFiles[i];
      onProgress?.(`[${i + 1}/${pdfFiles.length}] Memuat ${pdfFile.name}...`);
      
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const totalPages = pdf.numPages;
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          onProgress?.(`[${i + 1}/${pdfFiles.length}] Halaman ${pageNum}/${totalPages}...`);
          
          const page = await pdf.getPage(pageNum);
          
          // Scale to fit printer width
          const viewport = page.getViewport({ scale: 1 });
          const scale = PRINTER_WIDTH / viewport.width;
          const scaledViewport = page.getViewport({ scale });
          
          // Render to canvas
          const canvas = document.createElement('canvas');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext('2d')!;
          
          // Apply rotation
          if (rotation === 90 || rotation === 270) {
            canvas.width = scaledViewport.height;
            canvas.height = scaledViewport.width;
          }
          
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.save();
          if (rotation === 90) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
          } else if (rotation === 180) {
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
          } else if (rotation === 270) {
            ctx.translate(0, canvas.height);
            ctx.rotate(-Math.PI / 2);
          }
          
          await page.render({
            canvasContext: ctx,
            viewport: scaledViewport,
          }).promise;
          
          ctx.restore();
          
          // Convert and send
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const escPosData = imageDataToEscPos(imageData, sharpness);
          
          await sendEscPosData(writer, escPosData, onProgress);
          
          // Page break between pages
          if (pageNum < totalPages) {
            const pageBreak = new Uint8Array([0x1B, 0x64, 0x03]);
            await writer.writeValueWithoutResponse(pageBreak);
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
        
        success++;
        
        // Delay between files
        if (i < pdfFiles.length - 1) {
          const delay = new Uint8Array([0x1B, 0x64, 0x08]); // Feed 8 lines between files
          await writer.writeValueWithoutResponse(delay);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`Failed to print ${pdfFile.name}:`, error);
        failed++;
      }
    }
    
    console.log(`✅ Batch print complete: ${success} success, ${failed} failed`);
    return { success, failed };
    
  } catch (error) {
    console.error("Batch print error:", error);
    alert("Gagal cetak batch: " + (error as Error).message);
    return { success, failed: failed + (pdfFiles.length - success - failed) };
  }
}
