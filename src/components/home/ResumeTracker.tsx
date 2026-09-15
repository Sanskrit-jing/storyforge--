import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { readHomeCatalog, rememberHomeWork } from '../../lib/home/catalog'
export default function ResumeTracker(){
 const location=useLocation()
 useEffect(()=>{let active=true;const query=new URLSearchParams(location.search)
 const workspace=location.pathname.match(/^\/workspace\/(\d+)$/)
 const pid=workspace?Number(workspace[1]):location.pathname.startsWith('/short/')?Number(query.get('project')):0
 const wid=(location.pathname.startsWith('/script/')||location.pathname.startsWith('/chat/'))?Number(query.get('work')):0
 if(!pid&&!wid)return
 void readHomeCatalog().then(catalog=>{const row=catalog.works.find(r=>wid?r.work.id===wid:r.project.id===pid&&r.work.id===r.project.activeWorkId);if(active&&row)rememberHomeWork(row,location.pathname+location.search)}).catch(()=>undefined)
 return()=>{active=false}
 },[location.pathname,location.search]);return null
}
