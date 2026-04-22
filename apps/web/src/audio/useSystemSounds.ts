import { useMemo } from "react";
import type { PlaySoundOptions, SystemSoundId } from "./systemSounds";
import { systemSounds } from "./systemSounds";

export function useSystemSounds() {
  return useMemo(
    () => ({
      play: (id: SystemSoundId, opts?: PlaySoundOptions) => systemSounds.play(id, opts),
      stop: (id: SystemSoundId) => systemSounds.stop(id),
      preload: (ids: readonly SystemSoundId[]) => systemSounds.preload(ids),
      url: (id: SystemSoundId) => systemSounds.url(id),
    }),
    [],
  );
}
