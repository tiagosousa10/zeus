import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  opendir,
  stat,
  readFile,
  writeFile,
  rename,
  unlink,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";

type Limits = {
  totalBytes: number;
  memberBytes: number;
  totalFiles: number;
  memberFiles: number;
};
type Entry = {
  owner: string;
  list: string;
  file: string;
  bytes: number;
  expires: number;
  accessed: number;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** One owner per profile (the desktop holds its single-instance lock).
 * Filenames carry only hashes and expiry; values remain encrypted by the caller.
 * Serialize IO so eviction cannot race a read or an atomic publication.
 */
export class DiskCache {
  private entries = new Map<string, Entry>();
  private tail: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private sequence = 0;
  constructor(
    private dir: string,
    private limits: Limits,
    private clock: () => number,
  ) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      await this.initialize();
      return operation();
    });
    this.tail = result.catch(() => {});
    return result;
  }
  private async drop(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    await this.removeFile(entry.file);
    this.entries.delete(key);
  }
  private async removeFile(file: string) {
    try {
      await unlink(join(this.dir, file));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private async initialize() {
    if (this.initialized) return;
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    for await (const file of await opendir(this.dir)) {
      if (!file.isFile()) continue;
      const match =
        /^([a-f0-9]{64})\.([a-f0-9]{64})\.(\d+)\.([a-f0-9]{64})\.bin$/.exec(
          file.name,
        );
      if (
        !match ||
        !Number.isSafeInteger(Number(match[3])) ||
        Number(match[3]) <= this.clock()
      ) {
        if (file.name.endsWith(".bin") || file.name.endsWith(".tmp"))
          await this.removeFile(file.name);
        continue;
      }
      const info = await stat(join(this.dir, file.name));
      const key = `${match[1]}.${match[2]}.${match[4]}`;
      if (this.entries.has(key)) await this.drop(key);
      this.entries.set(key, {
        owner: match[1],
        list: match[2],
        file: file.name,
        bytes: info.size,
        expires: Number(match[3]),
        accessed: info.mtimeMs,
      });
      this.sequence = Math.max(this.sequence, info.mtimeMs);
      // Bound even the startup index when upgrading a profile with a huge cache.
      await this.enforce();
    }
    this.initialized = true;
  }
  private async enforce() {
    for (const [key, entry] of this.entries)
      if (entry.expires <= this.clock()) await this.drop(key);
    while (true) {
      let bytes = 0;
      const members = new Map<string, { bytes: number; files: number }>();
      for (const entry of this.entries.values()) {
        bytes += entry.bytes;
        const usage = members.get(entry.owner) ?? { bytes: 0, files: 0 };
        usage.bytes += entry.bytes;
        usage.files++;
        members.set(entry.owner, usage);
      }
      const over = [...members].find(
        ([, u]) =>
          u.bytes > this.limits.memberBytes ||
          u.files > this.limits.memberFiles,
      )?.[0];
      if (
        !over &&
        bytes <= this.limits.totalBytes &&
        this.entries.size <= this.limits.totalFiles
      )
        return;
      const oldest = [...this.entries]
        .filter(([, e]) => !over || e.owner === over)
        .sort((a, b) => a[1].accessed - b[1].accessed)[0];
      if (!oldest) return;
      await this.drop(oldest[0]);
    }
  }
  read(owner: string, list: string, key: string): Promise<string | undefined> {
    return this.run(async () => {
      const id = `${hash(owner)}.${hash(list)}.${hash(key)}`;
      const entry = this.entries.get(id);
      if (!entry) return undefined;
      if (entry.expires <= this.clock()) {
        await this.drop(id);
        return undefined;
      }
      try {
        const value = await readFile(join(this.dir, entry.file), "utf8");
        entry.accessed = ++this.sequence;
        const now = new Date();
        await utimes(join(this.dir, entry.file), now, now);
        return value;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        this.entries.delete(id);
        return undefined;
      }
    });
  }
  write(
    owner: string,
    list: string,
    key: string,
    value: string,
    expires: number,
  ): Promise<void> {
    return this.run(async () => {
      await this.enforce();
      const bytes = Buffer.byteLength(value);
      if (
        bytes > Math.min(this.limits.memberBytes, this.limits.totalBytes) ||
        expires <= this.clock()
      )
        return;
      const member = hash(owner),
        group = hash(list),
        digest = hash(key);
      const id = `${member}.${group}.${digest}`;
      await this.drop(id);
      const file = `${member}.${group}.${expires}.${digest}.bin`;
      // Reserve capacity before allocating the temporary file.
      this.entries.set(id, {
        owner: member,
        list: group,
        file,
        bytes,
        expires,
        accessed: ++this.sequence,
      });
      await this.enforce();
      if (!this.entries.has(id)) return;
      const temporary = `${randomUUID()}.tmp`;
      try {
        await writeFile(join(this.dir, temporary), value, {
          mode: 0o600,
          flag: "wx",
        });
        await rename(join(this.dir, temporary), join(this.dir, file));
      } catch (error) {
        this.entries.delete(id);
        await this.removeFile(temporary);
        throw error;
      }
    });
  }
  removeList(owner: string, list: string): Promise<void> {
    return this.run(async () => {
      const member = hash(owner),
        group = hash(list);
      for (const [key, entry] of this.entries)
        if (entry.owner === member && entry.list === group)
          await this.drop(key);
    });
  }
  prune(): Promise<void> {
    return this.run(() => this.enforce());
  }
}
