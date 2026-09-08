export default {
  async fetch(request, env) {
    const allowedOrigins = [
      "https://kjcrane.kr",
      "https://www.kjcrane.kr",
    ];

    const origin = request.headers.get("Origin") || "";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
        ? origin
        : "https://kjcrane.kr",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const data = await request.json();

      const region = String(data.region || "").trim();
      const work = String(data.work || "").trim();
      const date = String(data.date || "").trim();
      const phone = String(data.phone || "").trim();

      if (!region || !work || !phone) {
        return new Response(
          JSON.stringify({ ok: false, error: "필수 입력값이 누락되었습니다." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const sender = String(env.SOLAPI_SENDER || "").replace(/\D/g, "");
      const recipient = String(env.SOLAPI_RECIPIENT || "").replace(/\D/g, "");

      if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET || !sender || !recipient) {
        return new Response(
          JSON.stringify({ ok: false, error: "Worker 환경변수 설정을 확인해주세요." }),
          { status: 500, headers: corsHeaders }
        );
      }

      const text = [
        "[국제크레인 작업문의]",
        `지역: ${region}`,
        `작업: ${work}`,
        `희망일: ${date || "미정"}`,
        `연락처: ${phone}`,
      ].join("\n");

      const dateHeader = new Date().toISOString();
      const salt = crypto.randomUUID();

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.SOLAPI_API_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(dateHeader + salt)
      );

      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const authorization =
        `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${dateHeader}, salt=${salt}, signature=${signature}`;

      const solapiResponse = await fetch(
        "https://api.solapi.com/messages/v4/send-many/detail",
        {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                to: recipient,
                from: sender,
                text,
              },
            ],
          }),
        }
      );

      const raw = await solapiResponse.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        result = { raw };
      }

      if (!solapiResponse.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SOLAPI 발송 실패",
            status: solapiResponse.status,
            detail: result,
          }),
          { status: 502, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, result }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
