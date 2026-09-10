"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnectionConfig = getConnectionConfig;
exports.saveConnectionConfig = saveConnectionConfig;
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const EMPTY_CONFIG = { remoteAddress: "", accessToken: "" };
function resolveConfigPath() {
    try {
        const dir = electron_1.app.getPath("userData");
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        return node_path_1.default.join(dir, "client-config.json");
    }
    catch {
        return node_path_1.default.join(process.cwd(), "client-config.dev.json");
    }
}
function getConnectionConfig() {
    try {
        const raw = node_fs_1.default.readFileSync(resolveConfigPath(), "utf8");
        const parsed = JSON.parse(raw);
        return {
            remoteAddress: String(parsed?.remoteAddress ?? ""),
            accessToken: String(parsed?.accessToken ?? "")
        };
    }
    catch {
        return EMPTY_CONFIG;
    }
}
function saveConnectionConfig(config) {
    node_fs_1.default.writeFileSync(resolveConfigPath(), JSON.stringify(config, null, 2));
}
