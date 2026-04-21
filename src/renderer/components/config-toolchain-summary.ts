export type ToolchainSummarySection = {
  id: string;
  count: number;
  onAdd?: () => void;
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function sectionSummaryText(section: ToolchainSummarySection): string {
  switch (section.id) {
    case 'mcp':
      return section.count === 1
        ? '1 MCP server connected'
        : `${section.count} MCP servers connected`;
    case 'agents':
      return `${section.count} ${pluralize(section.count, 'agent')} available`;
    case 'skills':
      return `${section.count} ${pluralize(section.count, 'skill')} ready`;
    case 'commands':
      return section.count === 1
        ? '1 custom command available'
        : `${section.count} custom commands available`;
    default:
      return `${section.count} configured`;
  }
}

export function getVisibleToolchainSections<T extends ToolchainSummarySection>(sections: T[]): T[] {
  return sections.filter((section) => section.count > 0 || !!section.onAdd);
}
