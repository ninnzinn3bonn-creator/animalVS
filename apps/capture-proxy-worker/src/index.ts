const capturePrefix = "/capture";
const captureOrigin = "http://127.0.0.1:5180";

export default {
  async fetch(request, env): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetPath = incomingUrl.pathname.startsWith(capturePrefix)
      ? incomingUrl.pathname.slice(capturePrefix.length) || "/"
      : incomingUrl.pathname;
    const targetUrl = new URL(`${targetPath}${incomingUrl.search}`, captureOrigin);
    const targetRequest = new Request(targetUrl, request);

    try {
      return await env.CAPTURE_VPC.fetch(targetRequest);
    } catch (error) {
      console.error(JSON.stringify({
        event: "capture_proxy_failed",
        path: targetPath,
        message: error instanceof Error ? error.message : String(error)
      }));

      return Response.json(
        { message: "キャラクター撮影サービスは現在停止中です" },
        { status: 503 }
      );
    }
  }
} satisfies ExportedHandler<Env>;
