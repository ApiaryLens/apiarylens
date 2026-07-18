import type { ConformanceBackend } from './backend.js';
import { ApiActor, type BootstrapBody } from './actor.js';

/**
 * One isolated deployment of one backend profile plus lazily created
 * principals. Every fixture receives a fresh world, so fixtures never observe
 * each other's state.
 */
export class World {
  private ownerActor: ApiActor | undefined;
  private ownerBootstrap: BootstrapBody | undefined;

  constructor(readonly backend: ConformanceBackend) {}

  guest(): ApiActor {
    return new ApiActor(this.backend);
  }

  async owner(): Promise<ApiActor> {
    if (!this.ownerActor) {
      this.ownerActor = new ApiActor(this.backend);
      this.ownerBootstrap = await this.ownerActor.bootstrapOwner();
    }
    return this.ownerActor;
  }

  /** Recovery codes issued by the one-time owner bootstrap. */
  async ownerRecoveryCodes(): Promise<string[]> {
    await this.owner();
    if (!this.ownerBootstrap) throw new Error('Owner bootstrap was not captured');
    return this.ownerBootstrap.recoveryCodes;
  }

  async member(role: 'beekeeper' | 'viewer'): Promise<ApiActor> {
    const owner = await this.owner();
    const invitation = await owner.invite(role);
    const actor = new ApiActor(this.backend);
    const accepted = await actor.acceptInvitation(invitation.token);
    if (accepted.status !== 201) {
      throw new Error(`Invitation acceptance failed with status ${accepted.status}`);
    }
    return actor;
  }

  close(): void {
    this.backend.close();
  }
}
