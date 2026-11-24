/* JulaDirect live seller/supplier profile data and real actions. */
(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const toast = (message) => window.JD?.toast?.(message);
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  let active = null;
  let busy = false;

  async function client() {
    const auth = window.GamBasketAuth;
    if (!auth) throw new Error("Account service is unavailable");
    await auth.ready();
    const c = auth.getClient();
    if (!c) throw new Error("Marketplace service is unavailable");
    return c;
  }

  function formatReviews(rows, profileRows) {
    const authors = new Map((profileRows || []).map(p => [p.id, p]));
    const ratings = rows.map(r => Number(r.rating || 0)).filter(n => n >= 1 && n <= 5);
    const count = ratings.length;
    const average = count ? ratings.reduce((a,b) => a+b,0)/count : 0;
    const bars = [5,4,3,2,1].map(n => count ? ratings.filter(x => x === n).length/count*100 : 0);
    return {
      summary: { average, count, bars },
      items: rows.map(r => {
        const p = authors.get(r.buyer_id);
        return {
          author: p ? [p.first_name,p.last_name].filter(Boolean).join(" ") : "JulaDirect buyer",
          date: r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "",
          rating: Number(r.rating || 0),
          title: r.title || "",
          body: r.body || "",
          reply: r.seller_reply || ""
        };
      })
    };
  }

  function productCard(p) {
    return {
      id: p.id,
      title: p.title,
      price: Number(p.price || 0),
      category: p.category_id || "Other",
      sold: Number(p.sales_count || 0),
      stock: Number(p.stock || 0),
      image: p.main_image || "",
      href: "/product?id=" + encodeURIComponent(p.id)
    };
  }

  async function loadSeller(c, sellerId) {
    const [profileResult, storeResult, productResult, reviewResult, followResult, websiteResult] = await Promise.all([
      c.from("public_profiles").select("id,first_name,last_name,avatar_url,region,area,business_name,seller_type,is_seller_verified,has_business_store").eq("id",sellerId).maybeSingle(),
      c.from("stores").select("id,seller_id,name,description,category,logo_url,banner_url,location,phone,rating,total_sales,is_verified,is_active,created_at").eq("seller_id",sellerId).eq("is_active",true).maybeSingle(),
      c.from("products").select("id,title,price,currency,category_id,stock,location,main_image,status,sales_count,delivery_available,created_at").eq("seller_id",sellerId).eq("status","approved").order("created_at",{ascending:false}).limit(60),
      c.from("marketplace_reviews").select("id,product_id,buyer_id,rating,title,body,seller_reply,created_at").eq("seller_id",sellerId).eq("status","published").order("created_at",{ascending:false}).limit(30),
      c.rpc("seller_follow_summary",{p_seller:sellerId}),
      c.rpc("public_store_website",{p_seller:sellerId})
    ]);
    if (profileResult.error) throw profileResult.error;
    if (storeResult.error && storeResult.error.code !== "PGRST116") throw storeResult.error;
    if (productResult.error) throw productResult.error;
    if (reviewResult.error && !String(reviewResult.error.message || "").toLowerCase().includes("does not exist")) throw reviewResult.error;

    const profile = profileResult.data || {};
    const store = storeResult.data || {};
    const products = productResult.data || [];
    const rawReviews = reviewResult.data || [];
    const authorIds = [...new Set(rawReviews.map(r => r.buyer_id).filter(Boolean))];
    let publicAuthors = [];
    if (authorIds.length) {
      const res = await c.from("public_profiles").select("id,first_name,last_name,business_name").in("id",authorIds);
      if (!res.error) publicAuthors = res.data || [];
    }
    const reviews = formatReviews(rawReviews,publicAuthors);
    const followerData = !followResult.error ? (Array.isArray(followResult.data) ? followResult.data[0] : followResult.data) : null;
    const site = !websiteResult.error ? (Array.isArray(websiteResult.data) ? websiteResult.data[0] : websiteResult.data) : null;
    const name = store.name || profile.business_name || [profile.first_name,profile.last_name].filter(Boolean).join(" ") || "JulaDirect seller";
    const sales = products.reduce((n,p)=>n+Number(p.sales_count||0),0);
    const avg = reviews.summary.average;
    const data = {
      sellerId,
      name,
      avatar: store.logo_url || profile.avatar_url || "",
      cover: store.banner_url || "",
      website: site?.public_url || "",
      tagline: store.category || profile.seller_type || "JulaDirect seller",
      verified: !!(profile.is_seller_verified || store.is_verified),
      topRated: reviews.summary.count >= 10 && avg >= 4.8,
      location: store.location || [profile.area,profile.region].filter(Boolean).join(", ") || "The Gambia",
      joined: store.created_at ? new Date(store.created_at).toLocaleDateString("en-GB",{month:"long",year:"numeric"}) : "",
      responseTime: "See recent seller responses in Messages",
      rating: avg,
      reviewCount: reviews.summary.count,
      sold: sales,
      productCount: products.length,
      followers: Number(followerData?.follower_count||0),
      following: !!followerData?.following,
      responseRate: null,
      about: store.description || "Seller information has not been added yet.",
      highlights: [
        {icon:"bag",title:"Published listings",text: products.length + " currently approved listings"},
        {icon:"truck",title:"Delivery",text:"Delivery offered"},
        {icon:"shield",title:"JulaDirect profile",text: profile.is_seller_verified || store.is_verified ? "Seller verification is recorded on JulaDirect" : "Seller verification has not been completed"}
      ],
      type: store.category || profile.seller_type || "Seller",
      registered: store.created_at ? String(new Date(store.created_at).getFullYear()) : "",
      address: store.location || "",
      phone: store.phone || "",
      languages: "",
      hours: [],
      gallery: [],
      policies: [
        {icon:"truck",title:"Delivery",text:"Delivery is offered. Choose delivery at checkout."},
        {icon:"wallet",title:"Payment",text:"Only online payment methods actively enabled at checkout can be used. Do not pay outside JulaDirect."},
        {icon:"scale",title:"Returns and disputes",text:"Open the order in My Orders and contact JulaDirect support if an item is not as described."}
      ],
      reviews,
      products: products.map(productCard)
    };
    return data;
  }

  async function loadSupplier(c, requestedId) {
    let result = await c.from("supplier_profiles").select("id,user_id,business_name,description,business_category,phone,whatsapp,location,logo_url,banner_url,is_verified,is_active,created_at").eq("user_id",requestedId).eq("is_active",true).maybeSingle();
    if (!result.data && !result.error) {
      result = await c.from("supplier_profiles").select("id,user_id,business_name,description,business_category,phone,whatsapp,location,logo_url,banner_url,is_verified,is_active,created_at").eq("id",requestedId).eq("is_active",true).maybeSingle();
    }
    if (result.error) throw result.error;
    const supplier = result.data;
    if (!supplier) return null;
    const [publicResult, productsResult, reviewsResult] = await Promise.all([
      c.from("public_profiles").select("id,first_name,last_name,avatar_url,region,area,business_name,is_seller_verified").eq("id",supplier.user_id).maybeSingle(),
      c.from("products").select("id,title,price,currency,category_id,stock,location,main_image,status,sales_count,delivery_available,attributes").eq("supplier_id",supplier.id).eq("status","approved").order("created_at",{ascending:false}).limit(80),
      c.from("marketplace_reviews").select("id,product_id,buyer_id,rating,title,body,seller_reply,created_at").eq("seller_id",supplier.user_id).eq("status","published").order("created_at",{ascending:false}).limit(30)
    ]);
    if (productsResult.error) throw productsResult.error;
    if (reviewsResult.error && !String(reviewsResult.error.message||"").toLowerCase().includes("does not exist")) throw reviewsResult.error;
    const profile=publicResult.data||{};
    const products=productsResult.data||[];
    const reviews=formatReviews(reviewsResult.data||[],[]);
    return {
      supplierId:supplier.id,
      sellerId:supplier.user_id,
      name:supplier.business_name,
      avatar:supplier.logo_url || profile.avatar_url || "",
      cover:supplier.banner_url || "",
      tagline:supplier.business_category||"Wholesale supplier",
      verified:!!supplier.is_verified,
      topRated:reviews.summary.count>=10 && reviews.summary.average>=4.8,
      location:supplier.location||[profile.area,profile.region].filter(Boolean).join(", "),
      joined:supplier.created_at?new Date(supplier.created_at).toLocaleDateString("en-GB",{month:"long",year:"numeric"}):"",
      responseTime:"Contact the supplier through JulaDirect messages",
      rating:reviews.summary.average,
      reviewCount:reviews.summary.count,
      years:supplier.created_at?Math.max(0,new Date().getFullYear()-new Date(supplier.created_at).getFullYear()):0,
      moq:"See each published listing",
      leadTime:"Confirm with supplier before ordering",
      responseRate:null,
      about:supplier.description||"Supplier information has not been added yet.",
      highlights:[
        {icon:"bag",title:"Wholesale catalogue",text:products.length+" approved wholesale listings"},
        {icon:"truck",title:"Logistics",text:"Confirm lead times and delivery arrangements directly with the supplier"},
        {icon:"shield",title:"Supplier record",text:supplier.is_verified?"Supplier verification is recorded on JulaDirect":"Supplier verification has not been completed"}
      ],
      type:supplier.business_category||"Wholesale supplier",
      registered:supplier.created_at?String(new Date(supplier.created_at).getFullYear()):"",
      address:supplier.location||"",
      phone:supplier.phone||"",
      languages:"",
      hours:[],
      gallery:[],
      capabilities:[],
      certs:[],
      faq:[["How do I request a quote?","Use Request a quote to send the supplier a message through JulaDirect."],["How do I pay?","Use only an online payment method enabled at checkout."],["Can the supplier deliver?","Confirm delivery availability and cost with the supplier before ordering."]],
      reviews,
      products:products.map(productCard)
    };
  }

  function showError(message) {
    const root=$("#pf-root");
    if(root) root.innerHTML='<section class="pf-card2" role="alert"><h1>Profile could not be loaded</h1><p class="pf-prose"></p><a class="jd-link" href="explore.html">Return to marketplace</a></section>';
    const p=$("#pf-root .pf-prose"); if(p) p.textContent=message;
  }

  async function mount(options={}) {
    const kind=options.kind==="supplier"?"supplier":"seller";
    try {
      const c=await client();
      const auth=window.GamBasketAuth;
      const session=await auth.getSession();
      const param=new URLSearchParams(location.search).get("id");
      const requestedId=param || session?.user?.id || "";
      if(!uuid(requestedId)) throw new Error("A valid seller profile ID is required.");
      const data=kind==="supplier" ? await loadSupplier(c,requestedId) : await loadSeller(c,requestedId);
      if(!data) {
        showError(kind==="supplier" ? "This account has not published a supplier profile yet." : "This seller profile is not available.");
        return null;
      }
      active={kind,data};
      window.JD_PROFILE_LIVE_STATE=active;
      window.JDProfile.mount({kind,data});
      return data;
    } catch(e) {
      console.error("[JulaDirect profile]",e);
      showError(e?.message||"Please try again.");
      return null;
    }
  }

  async function startConversation(productId) {
    const auth=window.GamBasketAuth;
    if(!auth) throw new Error("Messaging is not available.");
    const res=await auth.startConversation(productId);
    const conversation=res?.conversation||res;
    if(!conversation?.id) throw new Error("Could not open the conversation.");
    return conversation.id;
  }

  document.addEventListener("jdprofile:follow",async e=>{
    if(!active?.data?.sellerId || busy) return;
    busy=true;
    const button=$('[data-pf="follow"]');
    try {
      const c=await client();
      const {data,error}=await c.rpc("set_seller_follow",{p_seller:active.data.sellerId,p_follow:!!e.detail?.following});
      if(error) throw error;
      const result=Array.isArray(data)?data[0]:data;
      active.data.followers=Number(result?.follower_count||active.data.followers||0);
      active.data.following=!!result?.following;
      if(button) {
        button.setAttribute("aria-pressed",String(active.data.following));
        const label=$("span",button); if(label) label.textContent=active.data.following?"Following":"Follow";
      }
      toast(active.data.following?"You are now following this seller.":"Seller unfollowed.");
    } catch(err) {
      const wanted=!!e.detail?.following;
      active.data.following=!wanted;
      if(button) {
        button.setAttribute("aria-pressed",String(!wanted));
        const label=$("span",button); if(label) label.textContent=!wanted?"Following":"Follow";
      }
      toast(err?.message||"Could not update your follow.");
    } finally {busy=false;}
  });

  document.addEventListener("jdprofile:message",async()=>{
    if(!active?.data) return;
    try {
      const first=active.data.products?.[0];
      if(!first?.id) throw new Error("This seller has no published listings to start a conversation from.");
      const id=await startConversation(first.id);
      location.assign("messages.html?conversation="+encodeURIComponent(id)+"&product="+encodeURIComponent(first.id));
    } catch(err) { toast(err?.message||"Could not open messages."); }
  });

  document.addEventListener("jdprofile:quote",async e=>{
    if(!active?.data || active.kind!=="supplier") return;
    try {
      const detail=e.detail||{};
      const product=active.data.products?.find(p=>p.title===detail.product)||active.data.products?.[0];
      if(!product?.id) throw new Error("This supplier has no published catalogue items yet.");
      const conversationId=await startConversation(product.id);
      const message=[
        "QUOTE REQUEST",
        "Product: "+(detail.product||product.title),
        "Quantity: "+Number(detail.quantity||1),
        "Name: "+(detail.name||""),
        "Phone: "+(detail.phone||""),
        "Notes: "+(detail.note||"")
      ].join("\n");
      await window.GamBasketAuth.sendMessage(conversationId,message);
      toast("Quote request sent through JulaDirect messages.");
      location.assign("messages.html?conversation="+encodeURIComponent(conversationId)+"&product="+encodeURIComponent(product.id));
    } catch(err) { toast(err?.message||"Could not send the quote request."); }
  });

  window.JDProfileLive={mount,loadSeller,loadSupplier};
  const start=()=>mount({kind:document.body.dataset.profileKind||"seller"});
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();