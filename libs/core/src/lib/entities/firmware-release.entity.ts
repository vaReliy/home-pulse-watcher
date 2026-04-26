import type { BoardType } from '../types/board-type.enum.js';
import type { ReleaseChannel } from '../types/release-channel.enum.js';

export class FirmwareRelease {
  readonly id: string;
  readonly version: string;
  readonly boardType: BoardType;
  readonly channel: ReleaseChannel;
  readonly checksum: string;
  readonly gcsPath: string;
  readonly isCritical: boolean;
  readonly createdAt: Date;

  constructor(props: {
    id: string;
    version: string;
    boardType: BoardType;
    channel: ReleaseChannel;
    checksum: string;
    gcsPath: string;
    isCritical: boolean;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.version = props.version;
    this.boardType = props.boardType;
    this.channel = props.channel;
    this.checksum = props.checksum;
    this.gcsPath = props.gcsPath;
    this.isCritical = props.isCritical;
    this.createdAt = props.createdAt;
  }
}
