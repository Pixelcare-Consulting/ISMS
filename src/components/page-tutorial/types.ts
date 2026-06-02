export interface PageTutorialSection {
  title: string;
  description?: string;
  bullets?: string[];
}

export interface PageTutorialContent {
  /** Accessible label for the ? trigger button */
  triggerLabel?: string;
  dialogTitle: string;
  dialogDescription?: string;
  sections: PageTutorialSection[];
  /** Optional footer link, e.g. Help & Support */
  helpHref?: string;
  helpLinkLabel?: string;
}
