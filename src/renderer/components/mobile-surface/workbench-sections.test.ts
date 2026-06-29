import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MobileDependencyCheck } from '../../../shared/types/mobile.js';
import {
  appendMobileDependencyGroup,
  buildMobileDependencyCheckRow,
  renderInspectCapabilityPanel,
} from './workbench-sections.js';

type FakeElement = {
  className: string;
  textContent: string;
  innerHTML: string;
  children: FakeElement[];
  open?: boolean;
  classList: {
    add: (value: string) => void;
    remove: (value: string) => void;
    contains: (value: string) => boolean;
  };
  append: (...children: FakeElement[]) => void;
  appendChild: (child: FakeElement) => FakeElement;
};

function makeElement(): FakeElement {
  const classTokens = new Set<string>();
  return {
    className: '',
    textContent: '',
    innerHTML: '',
    children: [],
    classList: {
      add: (value: string) => classTokens.add(value),
      remove: (value: string) => classTokens.delete(value),
      contains: (value: string) => classTokens.has(value),
    },
    append(...children: FakeElement[]) {
      this.children.push(...children);
    },
    appendChild(child: FakeElement) {
      this.children.push(child);
      return child;
    },
  };
}

function makeCheck(overrides?: Partial<MobileDependencyCheck>): MobileDependencyCheck {
  return {
    id: 'xcode',
    label: 'Xcode',
    scope: 'ios',
    requiredFor: ['ios'],
    required: true,
    status: 'missing',
    description: 'Install Xcode',
    message: 'Not found',
    autoFixAvailable: false,
    ...overrides,
  };
}

describe('mobile workbench section helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => makeElement(),
    } as unknown as Document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders capability rows for selected platform', () => {
    const panel = renderInspectCapabilityPanel('ios', {
      ios: 'iOS Simulator',
      android: 'Android Emulator',
    });
    expect(panel.className).toBe('mobile-surface-inspect-capabilities');
    expect(panel.children.length).toBeGreaterThanOrEqual(2);
  });

  it('builds dependency rows and appendable dependency groups', () => {
    const instance = {
      projectId: 'project-1',
      installState: null,
      installProgressCleanup: undefined,
      progressEl: makeElement() as unknown as HTMLDivElement,
    };
    const row = buildMobileDependencyCheckRow({
      instance,
      check: makeCheck(),
      isInspectBusy: () => false,
      setPaneStatus: () => {},
      setActionAvailability: () => {},
      refreshMobileSurfacePane: async () => {},
    });
    expect(row.className).toBe('mobile-surface-check-row');
    expect(row.children.length).toBe(2);

    const container = makeElement() as unknown as HTMLElement;
    appendMobileDependencyGroup({
      container,
      title: 'Dependency checklist',
      checks: [makeCheck()],
      renderCheckRow: () => row,
      options: {
        collapsible: true,
        open: false,
        description: 'Install required dependencies first.',
      },
    });
    expect((container as unknown as FakeElement).children.length).toBe(1);
  });
});
