/// <reference types="vite/client" />

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
  clientId?: string;
}

interface GoogleAccountsIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GoogleAccountsIdButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: string | number;
}

interface Window {
  google?: {
    accounts?: {
      id?: {
        initialize: (config: GoogleAccountsIdConfiguration) => void;
        renderButton: (parent: HTMLElement, options?: GoogleAccountsIdButtonOptions) => void;
        prompt: () => void;
      };
    };
  };
}