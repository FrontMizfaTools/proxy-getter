const BASE = "http://ananew.load.com:4222/t_nest/v1/proxy";

async function postJson(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }

  console.log(`[postJson] Success:`, res.status);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

export async function getNumOfProxies(): Promise<any> {
  const result = await postJson("/get-num-of-proxies");
  console.log(`[getNumOfProxies] Result:`, result);
  console.log(`[getNumOfProxies] Success:`, result.data);
  return result?.data;
}

export async function generateProxies(proxies: string): Promise<any> {
  return postJson("/generate-proxies", { proxies });
}

export async function cronjobRequest(url: string): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'GET', 
    });

    if (!response.ok) {
      console.warn(`[Cronjob] Failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Cronjob] Error:`, error);
  }
}

export default {
  getNumOfProxies,
  generateProxies,
  cronjobRequest,
};
