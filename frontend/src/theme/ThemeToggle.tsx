import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "../components/ui";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const ICON = { size: 14, strokeWidth: 2 } as const;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <Segmented<ThemeMode>
      ariaLabel="Theme"
      className={className}
      value={mode}
      onChange={setMode}
      options={[
        { value: "light", label: <Sun {...ICON} />, title: "Light" },
        { value: "dark", label: <Moon {...ICON} />, title: "Dark" },
        { value: "system", label: <Monitor {...ICON} />, title: "System" },
      ]}
    />
  );
}
