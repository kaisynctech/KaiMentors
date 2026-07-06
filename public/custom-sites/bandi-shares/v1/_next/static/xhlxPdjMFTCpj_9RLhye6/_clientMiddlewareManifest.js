self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^\\/custom-sites\\/bandi-shares\\/v1(?:\\/(_next\\/data\\/[^/]{1,}))?\\/apply(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/apply"
  },
  {
    "regexp": "^\\/custom-sites\\/bandi-shares\\/v1(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next\\/static|_next\\/image|favicon.ico|public\\/).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!_next/static|_next/image|favicon.ico|public/).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()