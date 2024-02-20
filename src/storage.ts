import fs from "node:fs/promises";

import { create as artifact } from "@actions/artifact";
import * as core from "@actions/core";
import { exec as _exec, type ExecOptions } from "@actions/exec";

function exec(command: string, options?: ExecOptions) {
  const splitted = command.trim().split(/ +/g);
  if (splitted.length === 0)
    return Promise.reject(new Error("command string is empty"));
  return _exec(splitted.shift() as string, splitted, options);
}

function getStorageMethod(): string {
  return core.getInput("storageMethod", {required: true})
}

/** @returns array of messageIDs */
export async function getMessageIDs(): Promise<string[]> {
  const method = getStorageMethod();
  switch (method) {
    case "none":
      return [];
    case "artifact":
      return artifact()
        .downloadArtifact("messageIDs", undefined, {createArtifactFolder: true})
        .then(v => fs.readFile(v.downloadPath + "/messageIDs.txt"))
        .then(v => v.toString()
          .trim()
          .split("\n")
        )
        .catch(e => {
          core.warning("Couldn't download artifact");
          core.warning(e);
          core.warning("Continuing anyway");
          return [];
        });
    case "git":
      return fs.readFile("./messageIDs.txt")
        .then(v => v.toString().trim().split("\n"))
        .catch(e => {
          core.warning("Couldn't read messageIDs");
          core.warning(e);
          core.warning("Continuing anyway");
          return [];
        })
    default:
      throw new Error(`Storage method is unknown: ${method}`);
  }
}

export async function pushMessageIDs() {
  const method = getStorageMethod();
  switch (method) {
    case "artifact":
      const retentionDaysNumber = Number(core.getInput("artifact_retentionDays"))
      const retentionDays = !isNaN(retentionDaysNumber) ? retentionDaysNumber
        : retentionDaysNumber > 0 ? retentionDaysNumber
        : undefined
      return artifact()
        .uploadArtifact("messageIDs", ["./messageIDs.txt"], "./", { retentionDays });
    case "git":
      await exec("git config --global user.name \"Actions\"")
      await exec("git config --global user.email \"noreply@users.noreply.github.com\"")
      await exec("git add ./messageIDs.txt")
      await _exec("git", ["commit", "-m", "Update stored messageIDs"])
      await exec("git push");
      return true;
    case "none":
      return false;
    default:
      throw new Error(`Storage method is unknown: ${method}`);
  }
}

export default {
  getMessageIDs,
  pushMessageIDs,
}
