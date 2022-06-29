import { prismaPrimary, prismaRead } from "~/lib/db.server"
import { isUUID } from "~/lib/uuid"
import { MembershipRole, PageType, type Site } from "~/lib/db.server"
import { Gate } from "~/lib/gate.server"
import { sendLoginEmail } from "~/lib/mailgun.server"
import { SiteNavigationItem } from "~/lib/types"
import { nanoid } from "nanoid"
import { getMembership } from "./membership"
import { checkReservedWords } from "~/lib/reserved-words"
import unidata from "~/lib/unidata"

export const checkSubdomain = async ({
  subdomain,
  updatingSiteId,
}: {
  subdomain: string
  updatingSiteId?: string
}) => {
  checkReservedWords(subdomain)

  const existingSite = await prismaPrimary.site.findUnique({
    where: {
      subdomain,
    },
  })

  if (existingSite?.deletedAt) {
    // Actuall delete the site so that the subdomain can be used again
    await prismaPrimary.site.delete({
      where: {
        id: existingSite.id,
      },
    })
    return
  }

  if (existingSite && (!updatingSiteId || existingSite.id !== updatingSiteId)) {
    throw new Error(`Subdomain already taken`)
  }
}

export const getUserSites = async (address: string) => {
  const profiles = await unidata.profiles.get({
    source: 'Crossbell Profile',
    identity: address,
    platform: 'Ethereum',
  });

  const sites = profiles.list?.sort((a, b) => +new Date(b.date_updated || 0) - +new Date(a.date_updated || 0))

  if (!sites || !sites.length) return null

  return sites
}

export const getSite = async (input: string) => {
  const profiles = await unidata.profiles.get({
    source: 'Crossbell Profile',
    identity: input,
    platform: 'Crossbell',
  });

  const site = profiles.list?.sort((a, b) => +new Date(b.date_updated || 0) - +new Date(a.date_updated || 0))?.[0]

  if (!site) return null

  return site
}

export const getSubscription = async (data: {
  userId: string
  siteId: string
}) => {
  const membership = await getMembership({
    ...data,
    role: MembershipRole.SUBSCRIBER,
  })
  if (!membership) return
  const config = membership.config as any
  return {
    ...membership,
    config: config && {
      email: config.email,
    },
  }
}

export async function updateSite(
  payload: {
    site: string
    name?: string
    description?: string
    icon?: string | null
    subdomain?: string
    navigation?: SiteNavigationItem[] // TODO
  },
) {
  return await unidata.profiles.set({
    source: 'Crossbell Profile',
    identity: payload.site,
    platform: 'Crossbell',
    action: 'update',
  }, {
    ...(payload.name && { name: payload.name }),
    ...(payload.description && { bio: payload.description }),
    ...(payload.icon && { avatars: [payload.icon] }),
    ...(payload.subdomain && { username: payload.subdomain }),
  })
}

export async function createSite(
  gate: Gate,
  payload: { name: string; subdomain: string },
) {
  const user = gate.getUser(true)
  await checkSubdomain({ subdomain: payload.subdomain })

  const navigation: SiteNavigationItem[] = [
    {
      id: nanoid(),
      label: "About",
      url: "/about",
    },
    {
      id: nanoid(),
      label: "Archives",
      url: "/archives",
    },
  ]
  const site = await prismaPrimary.site.create({
    data: {
      name: payload.name,
      subdomain: payload.subdomain,
      navigation,
      memberships: {
        create: {
          role: MembershipRole.OWNER,
          user: {
            connect: {
              id: user.id,
            },
          },
        },
      },
      pages: {
        create: {
          title: "About",
          slug: "about",
          excerpt: "",
          content: `My name is ${payload.name} and I'm a new site.`,
          published: true,
          publishedAt: new Date(),
          type: PageType.PAGE,
        },
      },
    },
  })

  return { site }
}

export async function subscribeToSite(
  gate: Gate,
  input: {
    siteId: string
    email?: boolean
    newUser?: {
      email: string
      url: string
    }
  },
) {
  // const { newUser } = input
  // if (newUser) {
  //   // Create the login token instead
  //   sendLoginEmail({
  //     email: newUser.email,
  //     url: newUser.url,
  //     toSubscribeSiteId: input.siteId,
  //   })
  //   return
  // }

  // const user = gate.getUser(true)

  // const site = await getSite(input.siteId)
  // const subscription = await getSubscription({
  //   userId: user.id,
  //   siteId: site.id,
  // })
  // if (!subscription) {
  //   await prismaPrimary.membership.create({
  //     data: {
  //       role: MembershipRole.SUBSCRIBER,
  //       user: {
  //         connect: {
  //           id: user.id,
  //         },
  //       },
  //       site: {
  //         connect: {
  //           id: site.id,
  //         },
  //       },
  //       config: {
  //         email: input.email,
  //       },
  //     },
  //   })
  // } else {
  //   await prismaPrimary.membership.update({
  //     where: {
  //       id: subscription.id,
  //     },
  //     data: {
  //       config: {
  //         email: input.email,
  //       },
  //     },
  //   })
  // }
}

export async function unsubscribeFromSite(
  gate: Gate,
  input: { siteId: string },
) {
  const user = gate.getUser(true)

  const subscription = await getSubscription({
    userId: user.id,
    siteId: input.siteId,
  })

  if (!subscription) {
    throw new Error(`Subscription not found`)
  }

  await prismaPrimary.membership.delete({
    where: {
      id: subscription.id,
    },
  })
}