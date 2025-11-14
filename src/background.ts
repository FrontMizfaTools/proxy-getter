import { getNumOfProxies, generateProxies,cronjobRequest } from "./utils/api";

const proxyWebUri = "https://www.711proxy.com/dashboard/Socks5-proxies";
let running = false;
let lastExecutedHour: number | null = null; // ذخیره آخرین ساعتی که processGetting اجرا شده
// const delayBetween = 60000;

// Cronjob configuration - هر 5 دقیقه یکبار
const CRONJOB_URL = "http://haproxy.load.com:5050/api/push/0EABY6IS2ZM42F3ngkfBrUf8or4UItvF?status=up&msg=OK&ping="; 
const CRONJOB_INTERVAL = 1 * 60 * 1000; // 5 دقیقه به میلی‌ثانیه
const availableNumberOfProxies = [
  1, 10, 50, 100, 200, 300, 400, 500, 1000, 5000, 10000,
];

function formatIranTime(input: Date | number): string {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getTimeUntilNextRun(): number {
  // Get current time as timestamp (UTC-based, timezone-independent)
  const now = Date.now();
  const nowDate = new Date(now);
  
  console.log("nowDate:", nowDate);
  console.log("nowDate UTC:", nowDate.toUTCString());
  
  // Get current UTC time components
  const currentYear = nowDate.getUTCFullYear();
  const currentMonth = nowDate.getUTCMonth();
  const currentDate = nowDate.getUTCDate();
  const currentHour = nowDate.getUTCHours();
  const currentMinute = nowDate.getUTCMinutes();
    
  // Check if it's exactly XX:32 UTC
  // Only start immediately if:
  // 1. We're in minute 32
  // 2. We haven't executed for this hour yet (lastExecutedHour !== currentHour)
  if (currentMinute === 32 && lastExecutedHour !== currentHour) {
    console.log(`✅ It's ${currentHour}:32 UTC now! Starting immediately.`);
    return 0; // Start immediately
  }
  
  // Calculate target time: next hour at minute 32
  let targetHour = currentHour;
  
  if (currentMinute < 32) {
    // If current minute is less than 32, schedule for same hour at 32
    targetHour = currentHour;
  } else {
    // If current minute is >= 32, schedule for next hour at 32
    targetHour = currentHour + 1;
  }
  
  // Create target time for XX:32 UTC (Date.UTC handles overflow automatically)
  const targetTime = Date.UTC(
    currentYear,
    currentMonth,
    currentDate,
    targetHour,
    32, // minute
    0,  // second
    0   // millisecond
  );
    
  const timeUntilNext = targetTime - now;
  const hours = Math.floor(timeUntilNext / 1000 / 60 / 60);
  const minutes = Math.floor((timeUntilNext / 1000 / 60) % 60);
  
  // Convert UTC time to Iran local time (UTC+3:30)
  const iranTime = formatIranTime(targetTime);
  
  console.log(`⏰ Time until next run: ${hours} hours and ${minutes} minutes (at ${targetHour}:32 UTC / ${iranTime} Iran time)`);
  
  return timeUntilNext;
}

function scheduleNextRun() {
  const timeUntilNext = getTimeUntilNextRun();
  console.log("timeUntilNext:", timeUntilNext);
  const nextRunDate = new Date(Date.now() + timeUntilNext);
  const hours = Math.floor(timeUntilNext / 1000 / 60 / 60);
  const minutes = Math.floor((timeUntilNext / 1000 / 60) % 60);
  console.log(
    `Next run scheduled in ${hours} hours and ${minutes} minutes (${nextRunDate.toUTCString()})`
  );
  
  setTimeout(() => {
    processGetting().then(() => {
      scheduleNextRun();
    });
  }, timeUntilNext);
}
scheduleNextRun();


cronjobRequest(CRONJOB_URL); 
setInterval(() => {
  cronjobRequest(CRONJOB_URL);
}, CRONJOB_INTERVAL);

async function processGetting() {
  if (running) {
    console.log("Previous run still in progress, skipping this tick.");
    return;
  }
  running = true;
  
  // ثبت ساعت فعلی به عنوان آخرین ساعت اجرا شده
  const now = new Date();
  lastExecutedHour = now.getUTCHours();
  console.log(`📝 Marked hour ${lastExecutedHour} as executed`);

  try {
    console.log("Processing...", formatIranTime(new Date()));
    const numResp = await getNumOfProxies();

    let desiredNumber = 0;
    if (typeof numResp === "number") desiredNumber = numResp;
    else if (numResp && typeof numResp.count === "number")
      desiredNumber = numResp.count;
    else if (numResp && typeof numResp.num === "number")
      desiredNumber = numResp.num;
    else {
      const maybeNum = Number(numResp);
      if (!Number.isNaN(maybeNum)) desiredNumber = maybeNum;
    }

    if (desiredNumber === 0 || isNaN(desiredNumber)) {
      console.warn(
        "Could not parse desired number of proxies from response:",
        numResp
      );
      return;
    }

    const target = nearestAvailable(desiredNumber, availableNumberOfProxies);

    console.log("Desired:", desiredNumber, "-> target nearest:", target);

    const tab = await openTab(proxyWebUri);
    if (!tab?.id) {
      throw new Error("Could not open tab for proxy website");
    }
    await delay(5000);

    const result = await executeInTab(tab.id, target);

    const proxiesText = Array.isArray(result) ? result[0] : result;
    console.log("proxiesText:", proxiesText);
    if (!proxiesText || typeof proxiesText !== "string") {
      console.warn("No proxies text returned from page script:", proxiesText);
    } else {
      console.log("Got proxies (length):", proxiesText.length);

      await generateProxies(proxiesText);
      console.log("Proxies sent to backend.");
    }

    try {
      chrome.tabs.remove(tab.id);
    } catch (e) {}
  } catch (err) {
    console.error("Error in processGetting:", err);
  } finally {
    running = false;
  }
}

function nearestAvailable(n: number, arr: number[]) {
  let best = arr[0];
  let bestDiff = Math.abs(n - best);
  for (const v of arr) {
    const d = Math.abs(n - v);
    if (d < bestDiff) {
      best = v;
      bestDiff = d;
    }
  }
  return best;
}
function openTab(url: string): Promise<chrome.tabs.Tab> {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (!tab || !tab.id) return resolve(tab as any);

      const tabId = tab.id;

      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      };

      const listener = (updatedTabId: number, changeInfo: any) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          cleanup();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        console.warn("⚠️ Tab did not report 'complete' in time, continuing...");
        cleanup();
      }, 15000);
    });
  });
}

function executeInTab(tabId: number, desiredCount: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const func = (count: number) => {
      function findSelectAfterLabel(labelText: string): HTMLElement | null {
        const wrappers = Array.from(document.querySelectorAll(".prxoyListRef"));

        for (const wrapper of wrappers) {
          console.log("prxoyListRef:", wrapper);
          const span = wrapper.querySelector("span");
          if (span && (span.textContent || "").trim() === labelText) {
            const select = wrapper.querySelector<HTMLElement>(
              ".arco-select-view-single.arco-select.arco-select-view.arco-select-view-size-medium.arco-select-view-search"
            );
            if (select) return select;
          }
        }

        return null;
      }
      function clickSelectOptionByNumber(number: string | number) {
        const strNumber = String(number).trim();
        const options = document.querySelectorAll<HTMLLIElement>(
          "li.arco-select-option"
        );

        for (const option of options) {
          const span = option.querySelector<HTMLSpanElement>(
            "span.arco-select-option-content"
          );
          if (span && span.textContent?.trim() === strNumber) {
            option.click();
            return true;
          }
        }

        return false;
      }
      function findButtonByText(
        text: string
      ): HTMLButtonElement | HTMLInputElement | null {
        const btns = Array.from(
          document.querySelectorAll(
            "button, input[type=button], input[type=submit]"
          )
        );
        for (const b of btns) {
          if (!b.textContent && (b as HTMLInputElement).value) {
            if (
              ((b as HTMLInputElement).value || "").trim().toLowerCase() ===
              text.toLowerCase()
            )
              return b as any;
          } else if (
            b.textContent &&
            b.textContent.trim().toLowerCase() === text.toLowerCase()
          )
            return b as any;
        }

        for (const b of btns) {
          if (
            (b.textContent || (b as HTMLInputElement).value || "")
              .toLowerCase()
              .includes(text.toLowerCase())
          )
            return b as any;
        }
        return null;
      }
      function getTextareaBeforeExportProxy(): HTMLTextAreaElement | null {
        const wrapper = document.querySelector<HTMLElement>(".exportPrxoyRef");
        if (!wrapper) return null;

        let prev = wrapper.previousElementSibling;
        while (prev) {
          const textarea = prev.querySelector<HTMLTextAreaElement>("textarea");
          if (textarea) return textarea;

          prev = prev.previousElementSibling;
        }

        return null;
      }
      try {
        const select =
          findSelectAfterLabel("Number of proxies") ||
          findSelectAfterLabel("Number of proxy");
        if (!select) {
          return { error: "Could not find select for 'Number of proxies'." };
        }
        select?.click();
        console.log(select);
        clickSelectOptionByNumber(count);

        const btn =
          findButtonByText("Generate") ||
          findButtonByText("Generate Proxies") ||
          findButtonByText("Generate");
        if (!btn) {
          return { error: "Could not find 'Generate' button.", proxies: null };
        }
        (btn as HTMLElement).click();

        function sleep(ms: number) {
          return new Promise((r) => setTimeout(r, ms));
        }

        return (async () => {
          const maxWait = 10000;
          const interval = 500;
          const start = Date.now();

          while (Date.now() - start < maxWait) {
            const ta = getTextareaBeforeExportProxy();
            if (ta && ta.value && ta.value.trim().length > 0) {
              return { proxies: ta.value, error: null };
            }

            await sleep(interval);
          }

          const finalTa = getTextareaBeforeExportProxy();
          return {
            proxies: finalTa ? finalTa.value : null,
            error: null,
            warning: "Timeout waiting for proxies",
          };
        })();
      } catch (e) {
        return { error: String(e) };
      }
    };

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func,
        args: [desiredCount],
      },
      (injectionResults) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!injectionResults || !injectionResults.length) return resolve(null);
        const r = injectionResults[0].result;
        if (!r) return resolve(null);
        if (r.error) return resolve(r);
        if (r.proxies) return resolve(r.proxies);
        return resolve(r.proxies ?? r);
      }
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
