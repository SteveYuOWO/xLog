import { GetServerSideProps } from "next"
import { SiteHome } from "~/components/site/SiteHome"
import { SiteLayout } from "~/components/site/SiteLayout"
import { trpc } from "~/lib/trpc"
import { createSSGHelpers } from "@trpc/react/ssg"
import { appRouter } from "~/router"
import { getTRPCContext } from "~/lib/trpc.server"
import { Viewer } from "~/lib/types"
import { getViewer } from "~/lib/viewer"
import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { getUserSites, getSite } from "~/models/site.model"
import { getPagesBySite } from "~/models/page.model"
import { Profile, Notes } from "unidata.js"
import { PageVisibilityEnum } from "~/lib/types"

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const domainOrSubdomain = ctx.params!.site as string

  const trpcContext = await getTRPCContext(ctx)
  const ssg = createSSGHelpers({ router: appRouter, ctx: trpcContext })

  const [site, posts] = await Promise.all([
    getSite(domainOrSubdomain),
    getPagesBySite({
      site: domainOrSubdomain,
      take: 1000,
      type: "post",
      visibility: PageVisibilityEnum.Published,
    }),
  ])

  return {
    props: {
      site,
      posts,
      domainOrSubdomain,
      trpcState: ssg.dehydrate(),
    },
  }
}

function SiteIndexPage({
  site,
  posts,
}: {
  site: Profile,
  posts: Notes,
  domainOrSubdomain: string
}) {
  return (
    <SiteLayout site={site!}>
      <SiteHome posts={posts} />
    </SiteLayout>
  )
}

export default SiteIndexPage