import fs from "node:fs/promises";

import * as core from "@actions/core";
import { exec as _exec, type ExecOptions } from "@actions/exec";
import { WebhookClient } from "discord.js";

function exec(command: string, options?: ExecOptions) {
  const splitted = command.trim().split(/ +/g);
  if (splitted.length === 0)
    return Promise.reject(new Error("command string is empty"));
  return _exec(splitted.shift() as string, splitted, options);
}

function getStorageMethod(): string {
  return core.getInput("storageMethod", {required: true})
}

function getStorageWebhook(): WebhookClient {
  return new WebhookClient({
    url: core.getInput("storageWebhookUrl", { required: true }),
  });
}

/** @returns array of messageIDs */
export async function getMessageIDs(): Promise<string[]> {
  const method = getStorageMethod();
  switch (method) {
    case "none":
      return [];
    case "git":
      return fs.readFile(core.getInput("storageGitFileLocation"))
        .then(v => v.toString().trim().split("\n"))
        .catch(e => {
          core.warning("Couldn't read messageIDs");
          core.warning(e);
          core.warning("Continuing anyway");
          return [];
        })
    case "webhook":
      return getStorageWebhook()
        .fetchMessage(core.getInput("storageWebhookMessageID"))
        .then(v => v.content.split(", "))
        .catch(e => {
          core.warning("Couldn't read messageIDs");
          return [];
        });
    default:
      throw new Error(`Storage method is unknown: ${method}`);
  }
}

export async function pushMessageIDs(messageIDs: string[]) {
  const method = getStorageMethod();
  switch (method) {
    case "git":
      const gitFileLocation = core.getInput("storageGitFileLocation", { required: true });
      await fs.copyFile(
        core.getInput("outputFileLocation"),
        gitFileLocation
      );
      await exec("git config --global user.name \"Actions\"")
      await exec("git config --global user.email \"noreply@users.noreply.github.com\"")
      await exec(`git add ${gitFileLocation}`);
      await _exec("git", ["commit", "-m", "Update stored messageIDs"])
      await exec("git push");
      return true;
    case "none":
      return false;
    case "webhook":
      const content = messageIDs.join(", ");
      try {
        const id = core.getInput("storageWebhookMessageID");
        if (id === "" || isNaN(Number(id)))
          throw new Error("Invalid argument provided for storageWebhookMessageID");
        await getStorageWebhook().editMessage(
          core.getInput("storageWebhookMessageID"),
          content
        )
        core.info("Message for storage edited!")
      }
      catch (e) {
        core.warning("Couldn't edit storage message");
        core.warning(e as Error);
        core.warning("Sending a new storage message");
        const message = await getStorageWebhook().send(messageIDs.join(", "));
        core.info(`Message for storage sent! ID: ${message.id}`);
      }
      return true;
    default:
      throw new Error(`Storage method is unknown: ${method}`);
  }
}

export default {
  getMessageIDs,
  pushMessageIDs,
}
