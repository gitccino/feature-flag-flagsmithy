"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { setFlagEnvironmentState } from "@/app/actions/flags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type FlagEnvCellProps = {
  state: {
    id: string;
    enabled: boolean;
    rolloutPercentage: number;
  };
};

export function FlagEnvCell({ state }: FlagEnvCellProps) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(state.enabled);
  const [rollout, setRollout] = React.useState(state.rolloutPercentage);
  const [draftRollout, setDraftRollout] = React.useState(state.rolloutPercentage);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [isSavingToggle, setIsSavingToggle] = React.useState(false);
  const [isSavingRollout, setIsSavingRollout] = React.useState(false);

  async function persist(
    nextEnabled: boolean,
    nextRollout: number,
    mode: "toggle" | "rollout",
  ) {
    if (mode === "toggle") setIsSavingToggle(true);
    else setIsSavingRollout(true);

    const result = await setFlagEnvironmentState({
      flagEnvironmentStateId: state.id,
      enabled: nextEnabled,
      rolloutPercentage: nextRollout,
    });

    if (mode === "toggle") setIsSavingToggle(false);
    else setIsSavingRollout(false);

    if (!result.ok) {
      setEnabled(state.enabled);
      setRollout(state.rolloutPercentage);
      setDraftRollout(state.rolloutPercentage);
      toast.error(result.error);
      return;
    }

    setEnabled(nextEnabled);
    setRollout(nextRollout);
    router.refresh();
  }

  async function onToggle(next: boolean) {
    setEnabled(next);
    await persist(next, rollout, "toggle");
  }

  async function onApplyRollout() {
    await persist(enabled, draftRollout, "rollout");
    setPopoverOpen(false);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Switch
        checked={enabled}
        disabled={isSavingToggle}
        onCheckedChange={onToggle}
        aria-label="Toggle flag for environment"
      />
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!enabled}
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Badge variant={enabled ? "secondary" : "outline"}>
              {rollout}%
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-64">
          <PopoverHeader>
            <PopoverTitle>Rollout percentage</PopoverTitle>
            <PopoverDescription>
              Percentage of users who receive the enabled value.
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-3 px-0.5">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={draftRollout}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isNaN(value)) return;
                  setDraftRollout(Math.min(100, Math.max(0, value)));
                }}
                className="w-20"
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[draftRollout]}
              onValueChange={(values) => setDraftRollout(values[0] ?? 0)}
            />
            <Button
              size="sm"
              disabled={isSavingRollout}
              onClick={onApplyRollout}
            >
              {isSavingRollout ? "Applying..." : "Apply"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
