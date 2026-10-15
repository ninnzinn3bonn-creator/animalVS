import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

interface AdminSession {
  csrf: string;
  expiresAt: number;
}

const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const cookieName = "hsb_admin_session";

export class AdminAuth {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly failures = new Map<string, { count: number; blockedUntil: number }>();

  constructor(private readonly adminId: string, private readonly adminPassword: string) {}

  isConfigured(): boolean {
    return this.adminId.length > 0 && this.adminPassword.length >= 4;
  }

  login(req: Request, res: Response): void {
    if (!this.isConfigured()) {
      res.status(503).json({ message: "管理者認証が設定されていません" });
      return;
    }
    const client = req.ip || "unknown";
    const failure = this.failures.get(client);
    if (failure && failure.blockedUntil > Date.now()) {
      res.status(429).json({ message: "ログイン試行が多すぎます。しばらく待ってください" });
      return;
    }
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeEqual(id, this.adminId) || !safeEqual(password, this.adminPassword)) {
      const count = (failure?.count ?? 0) + 1;
      this.failures.set(client, { count, blockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
      res.status(401).json({ message: "IDまたはパスワードが違います" });
      return;
    }
    this.failures.delete(client);
    const token = crypto.randomBytes(32).toString("base64url");
    const session = { csrf: crypto.randomBytes(24).toString("base64url"), expiresAt: Date.now() + sessionLifetimeMs };
    this.sessions.set(token, session);
    res.cookie(cookieName, token, this.cookieOptions(req));
    res.json({ authenticated: true, id: this.adminId, csrf: session.csrf, expiresAt: session.expiresAt });
  }

  session(req: Request, res: Response): void {
    const session = this.readSession(req);
    if (!session) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, id: this.adminId, csrf: session.csrf, expiresAt: session.expiresAt });
  }

  logout(req: Request, res: Response): void {
    const token = readCookie(req, cookieName);
    if (token) this.sessions.delete(token);
    res.clearCookie(cookieName, this.cookieOptions(req));
    res.status(204).end();
  }

  requireSession = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.readSession(req)) {
      res.status(401).json({ message: "管理者ログインが必要です" });
      return;
    }
    next();
  };

  requireCsrf = (req: Request, res: Response, next: NextFunction): void => {
    const session = this.readSession(req);
    if (!session || !safeEqual(String(req.header("x-csrf-token") ?? ""), session.csrf)) {
      res.status(403).json({ message: "操作を確認できませんでした" });
      return;
    }
    next();
  };

  private readSession(req: Request): AdminSession | null {
    const token = readCookie(req, cookieName);
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  private cookieOptions(req: Request) {
    return {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: req.secure || req.header("x-forwarded-proto") === "https",
      maxAge: sessionLifetimeMs,
      path: "/"
    };
  }
}

function readCookie(req: Request, name: string): string | null {
  const entry = (req.header("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
