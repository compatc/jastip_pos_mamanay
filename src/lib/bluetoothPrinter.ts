// Print receipt via Web Bluetooth API (ESC/POS thermal printer 76mm)
// Putian POS80-01 uses KT6368A BLE chip
// Confirmed service/characteristic from nRF Connect scan

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
    return sum + (item.qty * item.shopeePcs) / 1000;
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
