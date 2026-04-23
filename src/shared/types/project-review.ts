export interface ProjectReviewSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
}

export interface ProjectReviewState {
  reviews: ProjectReviewSource[];
  lastUpdated?: string;
}

export interface ProjectReviewCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectReviewState;
}

export interface ProjectReviewDocument {
  path: string;
  relativePath: string;
  title: string;
  contents: string;
}
