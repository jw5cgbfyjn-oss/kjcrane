export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = new Set(["https://kjcrane.kr", "https://www.kjcrane.kr"]);
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://kjcrane.kr",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if (request.method !== "POST") return new Response("Not Found",{status:404,headers:corsHeaders});
    try {
      const data = await request.json();
      const region = String(data.region || "").trim();
      const work = String(data.work || "").trim();
      const date = String(data.date || "").trim();
      const phone = String(data.phone || "").replace(/[^0-9]/g, "");
      if (!region || !work || !phone) return Response.json({ok:false,message:"필수 항목을 입력해주세요."},{status:400,headers:corsHeaders});
      const text = `[국제크레인 작업문의]\n지역: ${region}\n작업: ${work}\n일정: ${date || "미정"}\n연락처: ${phone}`;
      const dateTime = new Date().toISOString();
      const salt = crypto.randomUUID().replaceAll("-", "");
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw",encoder.encode(env.SOLAPI_API_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
      const signatureBuffer = await crypto.subtle.sign("HMAC",key,encoder.encode(dateTime + salt));
      const signature = Array.from(new Uint8Array(signatureBuffer)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const authorization = `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${dateTime}, salt=${salt}, signature=${signature}`;
      const solapiResponse = await fetch("https://api.solapi.com/messages/v4/send-many/detail",{
        method:"POST",
        headers:{"Authorization":authorization,"Content-Type":"application/json"},
        body:JSON.stringify({messages:[{to:env.SOLAPI_RECIPIENT,from:env.SOLAPI_SENDER,text}]})
      });
      const result = await solapiResponse.json();
      if (!solapiResponse.ok) {
        console.error("SOLAPI error:",result);
        return Response.json({ok:false,message:"문자 발송에 실패했습니다."},{status:502,headers:corsHeaders});
      }
      return Response.json({ok:true,message:"문의가 접수되었습니다."},{status:200,headers:corsHeaders});
    } catch (error) {
      console.error("Worker error:",error);
      return Response.json({ok:false,message:"문의 처리 중 오류가 발생했습니다."},{status:500,headers:corsHeaders});
    }
  }
};
