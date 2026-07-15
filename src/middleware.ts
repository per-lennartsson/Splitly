import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/households/:path*",
    "/dashboard/:path*",
    "/api/households/:path*",
    "/api/expenses/:path*",
    "/api/categories/:path*",
    "/api/recurring/:path*",
    "/api/settlements/:path*",
  ],
};
