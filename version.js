// The release this copy of the simulator belongs to: tools/deploy/publish_pages.sh writes the commit here. File URLs
// carry it (?v=), so the browser keeps them until the next release; "dev" (a local server) loads everything fresh
window.SIM_RELEASE = "4c7affb";
window.SIM_V = window.SIM_RELEASE === "dev" ? String(Date.now()) : window.SIM_RELEASE;
