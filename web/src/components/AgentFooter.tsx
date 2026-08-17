import { useState } from "react";

type Props = {
  skillHref: string;
};

export function AgentFooter({ skillHref }: Props) {
  const [copied, setCopied] = useState(false);

  async function copySkill() {
    try {
      await navigator.clipboard.writeText(skillHref);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <footer className="agent-foot">
      <p>
        <strong>Agents</strong> load the skill, then pay via CLI or MCP.
      </p>
      <div className="agent-actions">
        <a className="btn btn-ghost" href={skillHref}>
          Open SKILL.md
        </a>
        <button type="button" className="btn btn-ghost" onClick={copySkill}>
          {copied ? "Copied" : "Copy skill URL"}
        </button>
      </div>
    </footer>
  );
}
