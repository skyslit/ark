type Claim = {
  read: boolean;
  write: boolean;
  owner: boolean;
};
export type PermissionResult = {
  claims: Claim;
  currentItem: any;
  pathItems: any[];
};

export type IDynamicsPermissionDataStore = {
  getItems: (ns: string, paths: string[]) => Promise<any[]>;
};

export const extractPaths = (path: string = ''): string[] => {
  /** Normalise path (removes leading / (slash) if any) */
  if (path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  let paths: string[] = [];

  let bufferParts: string[] = path.split('/');
  let i: number;
  for (i = bufferParts.length; i > 0; i--) {
    paths.unshift(bufferParts.slice(0, i).join('/') || '/');
  }

  return paths;
};

function inheritPermissions(items: any[]): any[] {
  let ownershipBuffer: any[] = [];
  let bufferedPermissions: any[] = [];

  for (const item of items) {
    if (
      Array.isArray(item?.security?.permissions) &&
      item?.security?.permissions?.length > 0
    ) {
      bufferedPermissions = item.security.permissions;

      /** Buffer owners */
      const ownerships: any[] = item.security.permissions.filter(
        (p) => p.access === 'owner'
      );
      ownerships.forEach((owner) => {
        const similarUserOwner = ownershipBuffer.find(
          (o) => o.type === 'user' && o.userEmail === owner.userEmail
        );
        if (!similarUserOwner) {
          const similarPolicyOwner = ownershipBuffer.find(
            (o) => o.type === 'policy' && o.policy === owner.policy
          );
          if (!similarPolicyOwner) {
            ownershipBuffer.push(owner);
          }
        }
      });
    } else {
      if (!item?.security) {
        item.security = {
          permissions: [],
        };
      }

      item.security.permissions = bufferedPermissions;
    }

    /** Apply inherited ownerships */
    for (const owner of ownershipBuffer) {
      const foundAMatchingOwner = item.security.permissions.find(
        (p) =>
          p.access === 'owner' &&
          p.type === owner.type &&
          p.policy === owner.policy &&
          p.userEmail === owner.userEmail
      );
      if (!foundAMatchingOwner) {
        item.security.permissions.unshift(owner);
      }
    }
  }

  return items;
}

export const getItemPermission = async (
  ns: string,
  path: string,
  user: { emailAddress?: string; policies?: string[] },
  store: IDynamicsPermissionDataStore
): Promise<PermissionResult> => {
  const paths = extractPaths(path);

  let items = await store.getItems(ns, paths);
  items = inheritPermissions(items);

  const currentItem = items[items.length - 1] || null;

  let permissions = [];
  let claims: Claim = {
    owner: false,
    read: false,
    write: false,
  };

  let IS_SUPER_ADMIN = false;
  if (Array.isArray(user?.policies)) {
    IS_SUPER_ADMIN = user.policies.findIndex((p) => p === 'SUPER_ADMIN') > -1;
  }

  if (IS_SUPER_ADMIN === false) {
    if (Array.isArray(currentItem?.security?.permissions)) {
      permissions = currentItem?.security?.permissions.filter((p) => {
        switch (p?.type) {
          case 'user': {
            const shouldCheckEmail = Boolean(p?.userEmail);
            if (shouldCheckEmail === true) {
              if (p?.userEmail) {
                return p?.userEmail === user?.emailAddress;
              }
            } else {
              return Boolean(user);
            }

            break;
          }
          case 'policy': {
            if (p?.policy && Array.isArray(user?.policies)) {
              return user.policies.findIndex((pol) => pol === p?.policy) > -1;
            }

            break;
          }
          case 'public': {
            return true;
          }
        }

        return false;
      });

      for (const permission of permissions) {
        switch (permission?.access) {
          case 'read': {
            claims.read = true;
            break;
          }
          case 'write': {
            claims.read = true;
            claims.write = true;
            break;
          }
          case 'owner': {
            claims.read = true;
            claims.write = true;
            claims.owner = true;
            break;
          }
        }

        if (claims.owner === true) {
          break;
        }
      }
    }
  } else {
    claims.owner = true;
    claims.write = true;
    claims.read = true;
  }

  return {
    currentItem,
    pathItems: items,
    claims,
  };
};
