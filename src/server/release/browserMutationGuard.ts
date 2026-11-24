/** Prevent cross-origin cookie-backed mutations without breaking same-origin AI Studio iframe requests or bearer API clients. */
export function browserMutationAllowed(input:{method:string;hasSessionCookie:boolean;origin?:string;fetchSite?:string;requestOrigin:string}):boolean {
  if (['GET','HEAD','OPTIONS'].includes(input.method.toUpperCase()) || !input.hasSessionCookie) return true;
  if (input.origin) {
    try {
      const parsed=new URL(input.origin);
      return (parsed.protocol==='http:'||parsed.protocol==='https:') &&
        parsed.origin===input.origin && parsed.origin===new URL(input.requestOrigin).origin;
    } catch {return false;}
  }
  // Modern browser cross-site requests cannot bypass by omitting Origin.
  return input.fetchSite!=='cross-site';
}
