-- Product photo gallery (up to 6 photos per product).
--
-- `images` is the full ordered gallery; the first photo is the cover. `image_url` stays and always
-- holds the cover, so everything that reads it (shop grid, bag, orders, WhatsApp checkout) keeps
-- working. An empty `images` means "just image_url" (every product from before this change).
--
-- The trigger keeps the two in step whichever one a client writes, so an older version of the
-- admin panel that only knows `image_url` can't leave the gallery pointing at an old cover.

alter table public.products
  add column if not exists images text[] not null default '{}';

alter table public.products
  drop constraint if exists products_images_max;
alter table public.products
  add constraint products_images_max check (cardinality(images) <= 6);

create or replace function public.sync_product_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.images is distinct from old.images then
    -- The gallery was written: its first photo is the cover.
    if cardinality(new.images) > 0 then
      new.image_url := new.images[1];
    end if;
  elsif new.image_url is distinct from old.image_url and cardinality(new.images) > 0 then
    -- Only the cover was written (older admin panel): swap it into the gallery's first slot.
    new.images[1] := new.image_url;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_cover on public.products;
create trigger products_sync_cover
  before insert or update on public.products
  for each row execute function public.sync_product_cover();
