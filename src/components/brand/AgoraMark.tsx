// src/components/brand/AgoraMark.tsx
import * as React from "react";

type Props = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

export default function AgoraMark({ size = 22, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M32 10
          C28 10 25.2 11.8 23.4 15.0
          L10.6 39.2
          C8.2 43.8 10.0 49.4 14.8 51.6
          C19.2 53.6 24.2 51.8 26.4 47.6
          L32.0 36.4
          L37.6 47.6
          C39.8 51.8 44.8 53.6 49.2 51.6
          C54.0 49.4 55.8 43.8 53.4 39.2
          L40.6 15.0
          C38.8 11.8 36.0 10 32 10
          Z

          M32.0 22.6
          L24.5 37.3
          C23.6 39.1 24.3 41.3 26.1 42.1
          C27.8 42.9 29.8 42.2 30.7 40.5
          L32.0 38.0
          L33.3 40.5
          C34.2 42.2 36.2 42.9 37.9 42.1
          C39.7 41.3 40.4 39.1 39.5 37.3
          L32.0 22.6
          Z
        "
      />
    </svg>
  );
}





