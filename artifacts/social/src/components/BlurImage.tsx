import { useState, type ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> & {
  src: string;
  alt: string;
};

/**
 * Lazy-loaded image with a soft blur placeholder until the asset paints.
 * Falls back to a muted gradient if the image fails. Always opts in to
 * `loading="lazy"` and `decoding="async"` so feeds stay snappy.
 */
export function BlurImage({
  src,
  alt,
  className,
  style,
  onLoad,
  onError,
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <span
      className={[
        "blur-image-shell relative block overflow-hidden bg-muted",
        className ?? "",
      ].join(" ")}
      style={style}
      data-loaded={loaded ? "true" : "false"}
      data-errored={errored ? "true" : undefined}
    >
      {!loaded && !errored && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted"
        />
      )}
      {errored ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-muted to-muted/40"
        />
      ) : (
        <img
          {...rest}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={[
            "block h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          ].join(" ")}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={(e) => {
            setErrored(true);
            onError?.(e);
          }}
        />
      )}
    </span>
  );
}
