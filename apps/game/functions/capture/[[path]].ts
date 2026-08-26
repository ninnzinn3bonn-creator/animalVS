interface Env {
  CAPTURE_PROXY: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  return context.env.CAPTURE_PROXY.fetch(context.request);
};
