import { NextRequest, NextResponse } from 'next/server';
import COS from 'cos-nodejs-sdk-v5';

// Tencent Cloud configuration from environment variables
const CONFIG = {
  secretId: process.env.TENCENT_SECRET_ID || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  region: process.env.TENCENT_REGION || 'ap-shanghai',
  bucket: process.env.TENCENT_BUCKET || '',
};

// Initialize COS client
const cos = new COS({
  SecretId: CONFIG.secretId,
  SecretKey: CONFIG.secretKey,
});

// URL-safe Base64 encoding
function urlSafeBase64Encode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate signed URL for COS object
function getSignedUrl(key: string, expires: number = 7200): Promise<string> {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: CONFIG.bucket,
        Region: CONFIG.region,
        Key: key,
        Expires: expires,
        Sign: true,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data.Url);
      }
    );
  });
}

// Upload file to COS
function uploadToCOS(fileBuffer: Buffer, cosKey: string, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: CONFIG.bucket,
        Region: CONFIG.region,
        Key: cosKey,
        Body: fileBuffer,
        ContentType: contentType,
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Call ImageRepair API
async function callImageRepair(inputKey: string, maskKey: string): Promise<Buffer> {
  const host = `${CONFIG.bucket}.cos.${CONFIG.region}.myqcloud.com`;

  // Get signed URL for mask
  const signedMaskUrl = await getSignedUrl(maskKey, 7200);
  const encodedMaskUrl = urlSafeBase64Encode(signedMaskUrl);

  // Generate authorization
  const query: Record<string, string> = {
    'ci-process': 'ImageRepair',
    MaskPic: encodedMaskUrl,
  };

  // Build query string
  const queryStr = Object.keys(query)
    .map((k) => `${k}=${encodeURIComponent(query[k])}`)
    .join('&');

  const options = {
    hostname: host,
    method: 'GET' as const,
    path: `/${inputKey}?${queryStr}`,
    headers: {} as Record<string, string>,
  };

  // Get authorization from COS SDK
  const auth = COS.getAuthorization({
    SecretId: CONFIG.secretId,
    SecretKey: CONFIG.secretKey,
    Method: options.method,
    Pathname: `/${inputKey}`,
    Query: query,
    Headers: { Host: host },
  });

  options.headers = {
    Host: host,
    Authorization: auth,
  };

  // Make request
  const https = await import('https');
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`ImageRepair failed: HTTP ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.end();
  });

  return buffer;
}

export async function POST(request: NextRequest) {
  try {
    // Check configuration
    if (!CONFIG.secretId || !CONFIG.secretKey || !CONFIG.bucket) {
      return NextResponse.json(
        { error: '腾讯云配置缺失，请检查环境变量' },
        { status: 500 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const maskFile = formData.get('mask') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    if (!maskFile) {
      return NextResponse.json({ error: '请先生成遮罩' }, { status: 400 });
    }

    const timestamp = Date.now();
    const ext = imageFile.name.split('.').pop() || 'png';
    const inputKey = `api-input/${timestamp}.${ext}`;
    const maskKey = `api-mask/${timestamp}.${ext}`;

    // Upload files to COS
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const maskBuffer = Buffer.from(await maskFile.arrayBuffer());

    await uploadToCOS(imageBuffer, inputKey, imageFile.type);
    await uploadToCOS(maskBuffer, maskKey, maskFile.type);

    // Call ImageRepair
    const resultBuffer = await callImageRepair(inputKey, maskKey);

    // Return result as PNG
    return new NextResponse(new Uint8Array(resultBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="result.png"`,
      },
    });
  } catch (error) {
    console.error('Watermark removal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '处理失败' },
      { status: 500 }
    );
  }
}
