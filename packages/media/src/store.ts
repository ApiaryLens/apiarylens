import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export interface MediaStore {
  put(
    organizationId: string,
    mediaId: string,
    bytes: Uint8Array,
    variant?: 'original' | 'thumbnail',
  ): Promise<void>;
  get(
    organizationId: string,
    mediaId: string,
    variant?: 'original' | 'thumbnail',
  ): Promise<Uint8Array | undefined>;
  delete(
    organizationId: string,
    mediaId: string,
    variant?: 'original' | 'thumbnail',
  ): Promise<void>;
}

export class FilesystemMediaStore implements MediaStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(
    organizationId: string,
    mediaId: string,
    bytes: Uint8Array,
    variant: 'original' | 'thumbnail' = 'original',
  ): Promise<void> {
    const path = this.path(organizationId, mediaId, variant);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
  }

  async get(
    organizationId: string,
    mediaId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.path(organizationId, mediaId, variant)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async delete(
    organizationId: string,
    mediaId: string,
    variant?: 'original' | 'thumbnail',
  ): Promise<void> {
    if (variant) await rm(this.path(organizationId, mediaId, variant), { force: true });
    else
      await Promise.all([
        rm(this.path(organizationId, mediaId, 'original'), { force: true }),
        rm(this.path(organizationId, mediaId, 'thumbnail'), { force: true }),
      ]);
  }

  private path(organizationId: string, mediaId: string, variant: 'original' | 'thumbnail'): string {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
      throw new Error('Invalid media storage identifier');
    }
    const path = resolve(
      this.root,
      organizationId,
      variant === 'thumbnail' ? `${mediaId}.thumbnail` : mediaId,
    );
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error('Invalid media storage path');
    return path;
  }
}

export class MemoryMediaStore implements MediaStore {
  private readonly objects = new Map<string, Uint8Array>();
  private key(organizationId: string, mediaId: string, variant: 'original' | 'thumbnail') {
    return `${organizationId}:${mediaId}:${variant}`;
  }
  async put(
    organizationId: string,
    mediaId: string,
    bytes: Uint8Array,
    variant: 'original' | 'thumbnail' = 'original',
  ): Promise<void> {
    this.objects.set(this.key(organizationId, mediaId, variant), bytes.slice());
  }
  async get(
    organizationId: string,
    mediaId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ): Promise<Uint8Array | undefined> {
    return this.objects.get(this.key(organizationId, mediaId, variant))?.slice();
  }
  async delete(
    organizationId: string,
    mediaId: string,
    variant?: 'original' | 'thumbnail',
  ): Promise<void> {
    if (variant) this.objects.delete(this.key(organizationId, mediaId, variant));
    else {
      this.objects.delete(this.key(organizationId, mediaId, 'original'));
      this.objects.delete(this.key(organizationId, mediaId, 'thumbnail'));
    }
  }
}
