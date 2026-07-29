import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  const isProd = (process.env.NODE_ENV || process.env.DD_ENV) === "production";
  const msg =
    "JWT_SECRET 환경변수가 비어 있거나 16자 미만입니다. 안전한 값을 설정해 주세요.";

  if (isProd) {
    throw new Error(msg);
  }

  // dev/demo 에서는 매 부팅마다 다른 시크릿을 생성하여 예측 가능한 기본값을 방지
  const generated = (await import("crypto")).randomBytes(48).toString("hex");
  process.env.JWT_SECRET = generated;
  // eslint-disable-next-line no-console
  console.warn(
    `[auth] ${msg} 데모/개발 모드에서는 임시 시크릿을 생성합니다 (재시작 시 토큰 무효화됨).`
  );
}

function getSecret() {
  return process.env.JWT_SECRET;
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 10);
}

export async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
    },
    getSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({
      error: "invalid_token",
      message: "인증 정보가 만료되었거나 유효하지 않습니다.",
    });
  }
}
