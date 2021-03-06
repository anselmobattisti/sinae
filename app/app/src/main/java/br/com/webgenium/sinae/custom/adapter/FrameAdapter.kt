package br.com.webgenium.sinae.custom.adapter

import android.annotation.SuppressLint
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import br.com.webgenium.sinae.R
import br.com.webgenium.sinae.model.Frame


class FrameAdapter(frames: MutableList<Frame>) : SelectableAdapter<FrameAdapter.ViewHolder>() {

    private var mFrames: MutableList<Frame> = frames

    var onItemClick: ( (Frame, Int) -> Unit )? = null
    var onItemLongClick: ( (Frame, Int) -> Unit )? = null


    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(
            LayoutInflater.from(parent.context).inflate(R.layout.frame_listitem, parent, false)
        )
    }

    private fun frameTitle(frame: Frame) : String{
        return frame.filename.replace("_", " ") +"ms"
    }

    @SuppressLint("SetTextI18n")
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val frame = mFrames[position]

        holder.titulo.text = "Frame " + frameTitle(frame)

        if(frame.uploaded){
            holder.titulo.setCompoundDrawablesWithIntrinsicBounds(0,0, R.drawable.ic_check_green_24dp, 0)
            holder.titulo.setTextColor(ContextCompat.getColor(holder.titulo.context, R.color.colorItemTitleUploaded))
        } else {
            holder.titulo.setCompoundDrawablesWithIntrinsicBounds(0,0, 0, 0)
            holder.titulo.setTextColor(ContextCompat.getColor(holder.titulo.context, R.color.colorItemTitle))
        }

        if(isSelected(position)) {
            holder.item.setBackgroundColor(ContextCompat.getColor(holder.item.context, R.color.backgroundItemSelected))
        } else {
            holder.item.setBackgroundColor(ContextCompat.getColor(holder.item.context, R.color.backgroundItem))
        }
    }


    override fun getItemCount(): Int {
        return mFrames.size
    }


    fun atualizar(frames: MutableList<Frame>){
        this.mFrames = frames
        notifyDataSetChanged()
    }

    fun getItem(position: Int): Frame {
        return mFrames[position]
    }

    fun removerItem(frame: Frame){
        mFrames.remove(frame)
    }


    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        var titulo: TextView = itemView.findViewById(R.id.titulo)
        val item: View = itemView.findViewById(R.id.listitem)

        init {
            itemView.setOnClickListener {
                onItemClick?.invoke(mFrames[adapterPosition], adapterPosition)
            }

            itemView.setOnLongClickListener {
                onItemLongClick?.invoke(mFrames[adapterPosition], adapterPosition)
                true
            }
        }
    }
}