/**
 * Image build step for workers that render promo videos (INSTALL_VIDEO_RENDERER=1): download
 * Remotion's Chrome headless shell unless VIDEO_BROWSER_EXECUTABLE points at one, and pre-build
 * the bundle into VIDEO_BUNDLE_DIR so the first render doesn't wait for it.
 */
import { ensureBrowser } from "@remotion/renderer";
import { promoBundle } from "./render";

if (!process.env.VIDEO_BROWSER_EXECUTABLE) await ensureBrowser();
console.log(`video: bundle ready at ${await promoBundle()}`);
